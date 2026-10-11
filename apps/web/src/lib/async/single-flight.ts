/**
 * `lib/async/single-flight.ts` — collapse concurrent work for the same key.
 *
 * On a cold cache the BFF can receive several requests for the same upstream
 * value at once (a dashboard load and a detail load for the same spot, a browser
 * refresh, the boot pre-warm racing the first visitor). Without coalescing each
 * one opens its own upstream connection. While a task for a key is in flight,
 * other callers with that key await the same promise; the entry is dropped when
 * it settles, so the next miss starts fresh.
 *
 * A rejected task rejects every waiter (and is not memoized) — callers keep
 * their own stale-if-error / degradation handling.
 */

/** Coalesce concurrent `task`s by key. */
export type SingleFlight = <T>(key: string, task: () => Promise<T>) => Promise<T>;

/** Create an isolated single-flight registry. */
export function createSingleFlight(): SingleFlight {
	const inFlight = new Map<string, Promise<unknown>>();

	return <T>(key: string, task: () => Promise<T>): Promise<T> => {
		const existing = inFlight.get(key) as Promise<T> | undefined;
		if (existing) return existing;

		// Wrap in an async IIFE so a synchronous throw from `task` still yields a
		// rejected promise (and is not left as a half-populated map entry).
		const promise = (async () => task())();
		inFlight.set(key, promise);
		return promise.finally(() => {
			if (inFlight.get(key) === promise) inFlight.delete(key);
		});
	};
}
