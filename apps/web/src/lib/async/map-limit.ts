/**
 * `lib/async/map-limit.ts` — run an async worker over a list with bounded
 * concurrency.
 *
 * The BFF fans out to several upstream providers per spot; without a limit a
 * 16-spot dashboard could open dozens of sockets at once. Order of results is
 * preserved (result `i` belongs to item `i`).
 */

/** Map `items` through `worker`, keeping at most `limit` calls in flight. */
export async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	const effectiveLimit = Math.max(1, Math.min(limit, items.length));
	let cursor = 0;

	const runners = Array.from({ length: effectiveLimit }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return results;
}
