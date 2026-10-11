/**
 * `lib/providers/sources.ts` — small pure helpers over envelope provenance.
 *
 * The dashboard collapses 16 spots' worth of source records before rendering;
 * the spot detail page merges four envelopes. Both want "one entry per
 * provider, newest vintage". Kept pure and separate so it is unit-testable and
 * not confined to a component (`lib/providers/overview.ts` does the same merge
 * inline while also tracking staleness).
 */
import type { SourceRecord } from './types';

/**
 * Collapse records to one per provider (the newest `asOf`), provider-sorted.
 *
 * The newest record's `stale` flag wins, so a provider that is currently fresh
 * is not marked stale by an older cached read of the same provider.
 */
export function mergeSourceRecords(records: readonly SourceRecord[]): SourceRecord[] {
	const byProvider = new Map<string, SourceRecord>();
	for (const record of records) {
		const existing = byProvider.get(record.provider);
		if (!existing || record.asOf > existing.asOf) byProvider.set(record.provider, record);
	}
	return [...byProvider.values()].sort((a, b) => (a.provider < b.provider ? -1 : 1));
}
