import { describe, expect, it } from 'vitest';
import { compareSpotsByInfo, spotInfoScore } from './spot-ranking';
import type { SpotOverview } from './types';

function overview(
	id: string,
	name: string,
	parts: { current?: boolean; clarity?: boolean; tide?: boolean } = {}
): SpotOverview {
	return {
		id,
		name,
		region: 'san-diego',
		lat: 0,
		lon: 0,
		types: ['surf'],
		snapshot: {
			waveHeightM: parts.current ? 1.9 : null,
			wavePeriodS: parts.current ? 12 : null,
			waveDirDeg: parts.current ? 270 : null,
			waterTempC: parts.current ? 21.5 : null,
			windSpeedMs: parts.current ? 6.3 : null,
			windDirDeg: parts.current ? 197 : null,
			waterLevelM: parts.current ? 1.949 : null,
			tideState: parts.current ? 'falling' : null,
			clarityRating: parts.clarity ? 'excellent' : null
		},
		observedAt: parts.current ? '2026-10-11T05:30:00.000Z' : null,
		clarityObservedAt: parts.clarity ? '2026-10-08T12:00:00.000Z' : null,
		tide: parts.tide
			? {
					stationId: '9410230',
					preview: [{ time: '2026-10-11T00:00:00.000Z', heightM: 1, highLow: null }]
				}
			: null
	};
}

describe('spotInfoScore / compareSpotsByInfo', () => {
	it('counts every populated snapshot field plus observations and tide preview', () => {
		const full = overview('la-jolla-shores', 'La Jolla Shores', {
			current: true,
			clarity: true,
			tide: true
		});
		// 9 snapshot fields + observedAt + clarityObservedAt + tide preview.
		expect(spotInfoScore(full)).toBe(12);

		const empty = overview('catalina-avalon', 'Catalina Avalon');
		expect(spotInfoScore(empty)).toBe(0);
	});

	it('ranks information-rich spots ahead of sparse ones, name as the tiebreak', () => {
		const full = overview('la-jolla-shores', 'La Jolla Shores', {
			current: true,
			clarity: true,
			tide: true
		});
		const partial = overview('huntington-beach', 'Huntington Beach', { current: true });
		const empty = overview('catalina-avalon', 'Catalina Avalon');

		const ranked = [empty, partial, full].sort(compareSpotsByInfo);
		expect(ranked.map((spot) => spot.id)).toEqual([
			'la-jolla-shores',
			'huntington-beach',
			'catalina-avalon'
		]);

		// Equal scores fall back to alphabetical order.
		const laJollaCove = overview('la-jolla-cove', 'La Jolla Cove');
		const tied = [laJollaCove, empty].sort(compareSpotsByInfo);
		expect(tied.map((spot) => spot.id)).toEqual(['catalina-avalon', 'la-jolla-cove']);
	});
});
