import { describe, expect, it } from 'vitest';
import { createSingleFlight } from './single-flight';

describe('createSingleFlight', () => {
	it('runs one task per key while the first is in flight', async () => {
		const run = createSingleFlight();
		let calls = 0;
		const task = async () => {
			calls += 1;
			await new Promise((resolve) => setTimeout(resolve, 5));
			return calls;
		};

		const [a, b, c] = await Promise.all([run('k', task), run('k', task), run('k', task)]);

		expect(calls).toBe(1);
		expect([a, b, c]).toEqual([1, 1, 1]);
	});

	it('does not coalesce different keys', async () => {
		const run = createSingleFlight();
		let calls = 0;
		const task = async (value: number) => {
			calls += 1;
			return value;
		};

		expect(await run('a', () => task(1))).toBe(1);
		expect(await run('b', () => task(2))).toBe(2);
		expect(calls).toBe(2);
	});

	it('starts a fresh task once the previous one settled', async () => {
		const run = createSingleFlight();
		let calls = 0;
		const task = async () => {
			calls += 1;
			return calls;
		};

		expect(await run('k', task)).toBe(1);
		expect(await run('k', task)).toBe(2);
	});

	it('rejects every waiter and does not memoize the failure', async () => {
		const run = createSingleFlight();
		let calls = 0;
		const failing = async () => {
			calls += 1;
			throw new Error('boom');
		};

		const results = await Promise.allSettled([run('k', failing), run('k', failing)]);
		expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
		expect(calls).toBe(1);

		// A later call retries rather than replaying the rejection.
		expect(await run('k', async () => 'ok')).toBe('ok');
	});

	it('coalesces a synchronously-throwing task too', async () => {
		const run = createSingleFlight();
		await expect(
			run('k', () => {
				throw new Error('sync boom');
			})
		).rejects.toThrow('sync boom');
	});
});
