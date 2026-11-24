import { describe, expect, it } from 'vitest';
import { buildTidePreview } from './tide-preview';
import type { TidePrediction } from './types';

const WINDOW = { start: '2026-10-11T00:00:00.000Z', end: '2026-10-11T06:00:00.000Z' };

function tidePrediction(
	time: string,
	heightM: number,
	highLow: TidePrediction['highLow'] = null
): TidePrediction {
	return { time, heightM, highLow };
}

describe('buildTidePreview', () => {
	it('keeps every high/low event and decimates the hourly curve', () => {
		const predictions = [
			tidePrediction('2026-10-11T00:00:00.000Z', 1.0),
			tidePrediction('2026-10-11T01:00:00.000Z', 1.2),
			tidePrediction('2026-10-11T01:30:00.000Z', 1.4, 'high'),
			tidePrediction('2026-10-11T02:00:00.000Z', 1.1),
			tidePrediction('2026-10-11T03:00:00.000Z', 2.0),
			tidePrediction('2026-10-11T04:00:00.000Z', 0.5),
			tidePrediction('2026-10-11T04:45:00.000Z', 0.2, 'low'),
			tidePrediction('2026-10-11T06:00:00.000Z', 0.9)
		];

		const preview = buildTidePreview(predictions, WINDOW, 3);

		expect(preview.map((point) => point.time)).toEqual([
			'2026-10-11T00:00:00.000Z',
			'2026-10-11T01:30:00.000Z',
			'2026-10-11T03:00:00.000Z',
			'2026-10-11T04:45:00.000Z',
			'2026-10-11T06:00:00.000Z'
		]);
		expect(preview.find((point) => point.time === '2026-10-11T01:30:00.000Z')?.highLow).toBe(
			'high'
		);
	});

	it('lets a high/low event replace a curve point on the same instant', () => {
		const predictions = [
			tidePrediction('2026-10-11T03:00:00.000Z', 1.0),
			tidePrediction('2026-10-11T03:00:00.000Z', 2.2, 'high')
		];

		const preview = buildTidePreview(predictions, WINDOW, 1);

		expect(preview).toHaveLength(1);
		expect(preview[0]).toMatchObject({
			time: '2026-10-11T03:00:00.000Z',
			heightM: 2.2,
			highLow: 'high'
		});
	});

	it('clips points outside the window', () => {
		const predictions = [
			tidePrediction('2026-10-10T23:00:00.000Z', 3.3),
			tidePrediction('2026-10-11T00:00:00.000Z', 1.0),
			tidePrediction('2026-10-11T07:00:00.000Z', 9.9)
		];

		expect(buildTidePreview(predictions, WINDOW, 1).map((point) => point.time)).toEqual([
			'2026-10-11T00:00:00.000Z'
		]);
	});
});
