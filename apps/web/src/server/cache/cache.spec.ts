import { describe, expect, it } from 'vitest';
import { TtlCache } from './index';

/** Controllable clock so TTL behaviour is tested without real time passing. */
function fakeClock(start = 1_000_000) {
	let t = start;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
			return t;
		}
	};
}

describe('TtlCache', () => {
	it('serves a value fresh, then stale, then drops it', () => {
		const clock = fakeClock();
		const cache = new TtlCache({ now: clock.now });

		cache.set('k', { hello: 'world' }, 1_000, 5_000);

		const fresh = cache.read<{ hello: string }>('k');
		expect(fresh?.fresh).toBe(true);
		expect(fresh?.value).toEqual({ hello: 'world' });
		expect(cache.get<{ hello: string }>('k')).toEqual({ hello: 'world' });

		clock.advance(1_000);
		const stale = cache.read<{ hello: string }>('k');
		expect(stale?.fresh).toBe(false);
		expect(stale?.value).toEqual({ hello: 'world' });
		expect(cache.get('k')).toBeUndefined();

		clock.advance(5_000);
		expect(cache.read('k')).toBeUndefined();
		expect(cache.size).toBe(0);
	});

	it('returns undefined for an unknown key', () => {
		const cache = new TtlCache();
		expect(cache.read('nope')).toBeUndefined();
		expect(cache.get('nope')).toBeUndefined();
		expect(cache.has('nope')).toBe(false);
	});

	it('sweeps only entries past their stale window', () => {
		const clock = fakeClock();
		const cache = new TtlCache({ now: clock.now });

		cache.set('short', 'a', 100, 100); // stale until 200
		cache.set('long', 'b', 0, 10_000); // stale until 10_000

		clock.advance(500);
		expect(cache.sweep()).toBe(1);
		expect(cache.read('short')).toBeUndefined();
		expect(cache.read('long')?.value).toBe('b');
		expect(cache.size).toBe(1);
	});

	it('evicts the oldest write when past maxEntries', () => {
		const cache = new TtlCache({ maxEntries: 2 });
		cache.set('a', 1, 10_000);
		cache.set('b', 2, 10_000);
		cache.set('c', 3, 10_000);

		expect(cache.size).toBe(2);
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBe(2);
		expect(cache.get('c')).toBe(3);
	});

	it('deletes and clears', () => {
		const cache = new TtlCache();
		cache.set('a', 1, 10_000);
		cache.set('b', 2, 10_000);

		expect(cache.delete('a')).toBe(true);
		expect(cache.delete('a')).toBe(false);
		expect(cache.has('a')).toBe(false);
		expect(cache.size).toBe(1);

		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.has('b')).toBe(false);
	});
});
