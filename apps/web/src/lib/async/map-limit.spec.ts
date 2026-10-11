import { describe, expect, it } from 'vitest';
import { mapLimit } from './map-limit';

describe('mapLimit', () => {
	it('preserves result order', async () => {
		const items = [1, 2, 3, 4, 5];
		const results = await mapLimit(items, 2, async (item) => item * 2);
		expect(results).toEqual([2, 4, 6, 8, 10]);
	});

	it('never exceeds the concurrency limit', async () => {
		let active = 0;
		let peak = 0;
		const items = Array.from({ length: 10 }, (_, index) => index);

		await mapLimit(items, 3, async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 1));
			active -= 1;
			return active;
		});

		expect(peak).toBeLessThanOrEqual(3);
	});

	it('handles an empty list and clamps a limit above the list length', async () => {
		expect(await mapLimit([], 4, async (item) => item)).toEqual([]);
		expect(await mapLimit([1, 2], 99, async (item) => item + 1)).toEqual([2, 3]);
	});

	it('passes the index to the worker', async () => {
		const results = await mapLimit(['a', 'b'], 1, async (item, index) => `${item}${index}`);
		expect(results).toEqual(['a0', 'b1']);
	});
});
