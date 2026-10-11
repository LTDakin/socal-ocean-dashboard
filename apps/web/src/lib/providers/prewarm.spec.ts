import { describe, expect, it, vi } from 'vitest';
import type { Spot } from '../spots';
import { prewarmProviderCache } from './prewarm';

function spot(id: string): Spot {
	return {
		id,
		name: id,
		region: 'san-diego',
		lat: 32.8,
		lon: -117.2,
		types: ['surf'],
		offshoreModelPoint: { lat: 32.8, lon: -117.4 }
	};
}

const spots = [spot('a'), spot('b')];

describe('prewarmProviderCache', () => {
	it('warms the overview for every spot, then one forecast', async () => {
		const warmOverview = vi.fn(async (list: readonly Spot[]) => list);
		const warmForecast = vi.fn(async (target: Spot) => target);

		const result = await prewarmProviderCache({ spots, warmOverview, warmForecast });

		expect(warmOverview).toHaveBeenCalledTimes(1);
		expect(warmOverview.mock.calls[0][0]).toBe(spots);
		expect(warmForecast).toHaveBeenCalledTimes(1);
		expect(warmForecast.mock.calls[0][0]).toBe(spots[0]);
		expect(result).toEqual({ overviewSpots: 2, forecastSpotId: 'a' });
	});

	it('logs and continues when the overview fails', async () => {
		const log = vi.fn();
		const result = await prewarmProviderCache({
			spots,
			warmOverview: async () => {
				throw new Error('overview down');
			},
			warmForecast: async () => undefined,
			log
		});

		expect(result.overviewSpots).toBe(0);
		expect(result.forecastSpotId).toBe('a');
		expect(log).toHaveBeenCalledWith('[prewarm] overview failed: overview down');
	});

	it('logs and continues when the forecast fails', async () => {
		const log = vi.fn();
		const result = await prewarmProviderCache({
			spots,
			warmOverview: async () => undefined,
			warmForecast: async () => {
				throw new Error('nomads down');
			},
			log
		});

		expect(result.overviewSpots).toBe(2);
		expect(result.forecastSpotId).toBeNull();
		expect(log).toHaveBeenCalledWith('[prewarm] forecast failed: nomads down');
	});

	it('does nothing when there are no spots', async () => {
		const warmOverview = vi.fn(async () => undefined);
		const warmForecast = vi.fn(async () => undefined);
		const result = await prewarmProviderCache({ spots: [], warmOverview, warmForecast });

		expect(result).toEqual({ overviewSpots: 0, forecastSpotId: null });
		expect(warmOverview).not.toHaveBeenCalled();
		expect(warmForecast).not.toHaveBeenCalled();
	});
});
