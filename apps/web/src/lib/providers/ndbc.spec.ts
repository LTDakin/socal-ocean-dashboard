import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../spots';
import {
	buildNdbcRealtimeUrl,
	createNdbcAdapter,
	createNdbcSource,
	ndbcTwinForCdipBuoy,
	parseNdbcRealtime2,
	type NdbcSource
} from './ndbc';
import { createSpotDataService } from './service';
import { ProviderError, type ForecastWindow } from './types';

const FIXTURES = new URL('../../../fixtures/ndbc/', import.meta.url);
const SCRIPPS = readFileSync(new URL('realtime2.46254.txt', FIXTURES), 'utf8');
const TORREY = readFileSync(new URL('realtime2.46225.txt', FIXTURES), 'utf8');

const WINDOW: ForecastWindow = {
	start: '2026-10-11T16:00:00Z',
	end: '2026-10-11T19:00:00Z'
};

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

describe('ndbcTwinForCdipBuoy', () => {
	it('resolves the NDBC twin of a CDIP buoy', () => {
		expect(ndbcTwinForCdipBuoy('201')).toBe('46254');
		expect(ndbcTwinForCdipBuoy('092')).toBe('46222');
	});

	it('returns undefined when there is no twin', () => {
		expect(ndbcTwinForCdipBuoy('172')).toBeUndefined();
		expect(ndbcTwinForCdipBuoy(undefined)).toBeUndefined();
	});
});

describe('buildNdbcRealtimeUrl', () => {
	it('points at the realtime2 text file', () => {
		expect(buildNdbcRealtimeUrl('46254')).toBe(
			'https://www.ndbc.noaa.gov/data/realtime2/46254.txt'
		);
	});
});

describe('parseNdbcRealtime2', () => {
	it('reads the newest Scripps Nearshore row (met columns are MM)', () => {
		expect(parseNdbcRealtime2(SCRIPPS)).toEqual({
			observedAt: '2026-10-11T17:26:00.000Z',
			waveHeightM: 2.0,
			wavePeriodS: 6,
			waveDirDeg: 275,
			waterTempC: 21.4,
			windSpeedMs: null,
			windDirDeg: null
		});
	});

	it('reads the newest Torrey Pines Outer row', () => {
		expect(parseNdbcRealtime2(TORREY)).toEqual({
			observedAt: '2026-10-11T17:56:00.000Z',
			waveHeightM: 2.4,
			wavePeriodS: 11,
			waveDirDeg: 191,
			waterTempC: 23.1,
			windSpeedMs: null,
			windDirDeg: null
		});
	});

	it('skips header, short, and all-missing rows', () => {
		const body = [
			'#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE',
			'#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft',
			'2026 10 11 17 00 MM MM MM MM MM MM MM MM MM MM MM MM MM MM',
			'2026 10 11 16 56 250 5.5 MM 2.1 7 6.0 280 1012 22.0 21.5 MM MM MM MM',
			'garbage'
		].join('\n');

		expect(parseNdbcRealtime2(body)).toEqual({
			observedAt: '2026-10-11T16:56:00.000Z',
			waveHeightM: 2.1,
			wavePeriodS: 7,
			waveDirDeg: 280,
			waterTempC: 21.5,
			windSpeedMs: 5.5,
			windDirDeg: 250
		});
	});

	it('returns null when nothing is usable', () => {
		expect(parseNdbcRealtime2('# header only\n')).toBeNull();
	});
});

describe('createNdbcSource', () => {
	it('fetches once per URL and caches the observation', async () => {
		const calls: string[] = [];
		const source = createNdbcSource({
			fetchImpl: async (url) => {
				calls.push(url);
				return new Response(SCRIPPS, { status: 200 });
			}
		});

		await source.getLatestObservation('46254');
		await source.getLatestObservation('46254');
		expect(calls).toHaveLength(1);
	});

	it('surfaces HTTP failures', async () => {
		const source = createNdbcSource({
			fetchImpl: async () => new Response('not found', { status: 404 })
		});
		await expect(source.getLatestObservation('00000')).rejects.toMatchObject({
			name: 'ProviderError',
			retryable: false
		});
		await expect(source.getLatestObservation('00000')).rejects.toBeInstanceOf(ProviderError);
	});
});

describe('createNdbcAdapter', () => {
	function fixtureSource(observation = parseNdbcRealtime2(SCRIPPS)): NdbcSource {
		return {
			async getLatestObservation() {
				return observation;
			}
		};
	}

	it('fills the wave fields from the CDIP twin', async () => {
		const adapter = createNdbcAdapter({ source: fixtureSource() });
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');

		const result = await service.getSpotData(spot, WINDOW, { providers: ['ndbc'] });
		expect(result.sources[0]).toMatchObject({
			provider: 'ndbc',
			asOf: '2026-10-11T17:26:00.000Z'
		});
		expect(result.data.ndbc).toMatchObject({
			stationId: '46254',
			observation: { waveHeightM: 2.0, waterTempC: 21.4 }
		});
	});

	it('degrades for spots whose buoy has no NDBC twin', async () => {
		const adapter = createNdbcAdapter({ source: fixtureSource() });
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('imperial-beach');

		const result = await service.getSpotData(spot, WINDOW, { providers: ['ndbc'] });
		expect(result.sources[0].asOf).toBe(WINDOW.start);
		expect(result.data.ndbc).toEqual({
			spotId: 'imperial-beach',
			stationId: null,
			observation: null
		});
	});

	it('drops an observation older than the window', async () => {
		const adapter = createNdbcAdapter({
			source: fixtureSource({
				...parseNdbcRealtime2(SCRIPPS)!,
				observedAt: '2026-10-11T09:00:00.000Z'
			})
		});
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');

		const result = await service.getSpotData(spot, WINDOW, { providers: ['ndbc'] });
		expect(result.data.ndbc).toMatchObject({ stationId: '46254', observation: null });
		expect(result.sources[0].asOf).toBe(WINDOW.start);
	});
});
