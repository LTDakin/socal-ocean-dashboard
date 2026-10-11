import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../spots';
import {
	buildCdipWaveUrl,
	createCdipAdapter,
	createCdipSource,
	parseCdipWave,
	type CdipSource
} from './cdip';
import { createSpotDataService } from './service';
import { ProviderError, type ForecastWindow } from './types';

const RECENT = new URL('../../../fixtures/cdip/wave_agg.station-201.recent.json', import.meta.url);
const recentBody = readFileSync(RECENT, 'utf8');

const WINDOW: ForecastWindow = {
	start: '2026-10-11T16:00:00Z',
	end: '2026-10-11T19:00:00Z'
};

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

const spot = spotOrThrow('la-jolla-shores');

describe('buildCdipWaveUrl', () => {
	it('quotes the station and asks for the wave columns since the window start', () => {
		expect(buildCdipWaveUrl({ stationId: '201', since: WINDOW.start })).toBe(
			'https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json' +
				'?time,waveHs,waveTp,waveDp&station_id=%22201%22&time>=2026-10-11T16%3A00%3A00Z'
		);
	});
});

describe('parseCdipWave', () => {
	it('returns the newest observable row from the committed fixture', () => {
		expect(parseCdipWave(recentBody, 'fixture')).toEqual({
			observedAt: '2026-10-11T17:30:00.000Z',
			waveHeightM: 1.98,
			wavePeriodS: 6.6666665,
			waveDirDeg: 268.34375
		});
	});

	it('keeps partial rows and ignores all-null ones', () => {
		const body = JSON.stringify({
			table: {
				columnNames: ['time', 'waveHs', 'waveTp', 'waveDp'],
				rows: [
					['2026-10-11T16:00:00Z', 1.2, null, null],
					['2026-10-11T17:00:00Z', null, null, null],
					['2026-10-11T17:30:00Z', null, 3.5, null]
				]
			}
		});
		expect(parseCdipWave(body, 'fixture')).toEqual({
			observedAt: '2026-10-11T17:30:00.000Z',
			waveHeightM: null,
			wavePeriodS: 3.5,
			waveDirDeg: null
		});
	});

	it('returns null for an empty table', () => {
		expect(
			parseCdipWave('{"table":{"columnNames":["time","waveHs"],"rows":[]}}', 'fixture')
		).toBeNull();
	});

	it('rejects non-JSON bodies', () => {
		expect(() => parseCdipWave('<html>', 'fixture')).toThrow(ProviderError);
	});
});

describe('createCdipSource', () => {
	it('fetches once per URL and caches the observation', async () => {
		const calls: string[] = [];
		const source = createCdipSource({
			fetchImpl: async (url) => {
				calls.push(url);
				return new Response(recentBody, { status: 200 });
			}
		});

		const first = await source.getLatestWave('201', WINDOW.start);
		expect(first?.waveHeightM).toBe(1.98);
		expect(calls).toHaveLength(1);

		const second = await source.getLatestWave('201', WINDOW.start);
		expect(second).toEqual(first);
		expect(calls).toHaveLength(1);
	});

	it('treats ERDDAP "no matching results" as an absent observation', async () => {
		const source = createCdipSource({
			fetchImpl: async () =>
				new Response(
					'Error { code=404; message="Not Found: Your query produced no matching results."; }',
					{ status: 404 }
				)
		});
		await expect(source.getLatestWave('201', WINDOW.start)).resolves.toBeNull();
	});

	it('surfaces real HTTP failures with retryability', async () => {
		const server = createCdipSource({
			fetchImpl: async () => new Response('boom', { status: 500 })
		});
		await expect(server.getLatestWave('201', WINDOW.start)).rejects.toMatchObject({
			name: 'ProviderError',
			retryable: true
		});

		const offline = createCdipSource({
			fetchImpl: async () => {
				throw new Error('dns');
			}
		});
		await expect(offline.getLatestWave('201', WINDOW.start)).rejects.toBeInstanceOf(ProviderError);
	});
});

describe('createCdipAdapter', () => {
	function fixtureSource(): CdipSource {
		return {
			async getLatestWave() {
				return {
					observedAt: '2026-10-11T17:30:00.000Z',
					waveHeightM: 1.98,
					wavePeriodS: 6.67,
					waveDirDeg: 268.34
				};
			}
		};
	}

	it('returns the buoy reading with provenance through the cache', async () => {
		const adapter = createCdipAdapter({ source: fixtureSource() });
		const service = createSpotDataService({ adapters: [adapter] });

		const result = await service.getSpotData(spot, WINDOW, { providers: ['cdip'] });
		expect(result.ok).toBe(true);
		expect(result.sources[0]).toMatchObject({
			provider: 'cdip',
			asOf: '2026-10-11T17:30:00.000Z',
			stale: false,
			fromCache: false
		});
		expect(result.data.cdip).toMatchObject({
			spotId: 'la-jolla-shores',
			stationId: '201',
			observation: { waveHeightM: 1.98 }
		});

		const second = await service.getSpotData(spot, WINDOW, { providers: ['cdip'] });
		expect(second.sources[0].fromCache).toBe(true);
	});

	it('degrades to an empty payload when the spot has no buoy', async () => {
		const adapter = createCdipAdapter({ source: fixtureSource() });
		const service = createSpotDataService({ adapters: [adapter] });
		const noBuoy: Spot = { ...spot, cdipBuoyId: undefined };

		const result = await service.getSpotData(noBuoy, WINDOW, { providers: ['cdip'] });
		expect(result.ok).toBe(true);
		expect(result.sources[0].asOf).toBe(WINDOW.start);
		expect(result.data.cdip).toEqual({
			spotId: 'la-jolla-shores',
			stationId: null,
			observation: null
		});
	});
});
