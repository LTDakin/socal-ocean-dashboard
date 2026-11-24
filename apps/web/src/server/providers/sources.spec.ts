import { describe, expect, it } from 'vitest';
import { mergeSourceRecords } from './sources';
import type { SourceRecord } from './types';

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
	return {
		provider: 'cdip',
		asOf: '2026-10-11T05:00:00.000Z',
		fetchedAt: '2026-10-11T05:05:00.000Z',
		stale: false,
		fromCache: false,
		...overrides
	};
}

describe('mergeSourceRecords', () => {
	it('keeps the newest record per provider, provider-sorted', () => {
		const merged = mergeSourceRecords([
			source({ provider: 'cdip', asOf: '2026-10-11T05:00:00.000Z' }),
			source({ provider: 'ndbc', asOf: '2026-10-11T05:10:00.000Z' }),
			source({ provider: 'cdip', asOf: '2026-10-11T04:00:00.000Z', stale: true })
		]);

		expect(merged.map((record) => record.provider)).toEqual(['cdip', 'ndbc']);
		expect(merged[0].asOf).toBe('2026-10-11T05:00:00.000Z');
		// The newer cdip read replaces the older stale one.
		expect(merged[0].stale).toBe(false);
	});

	it('returns an empty list for no records', () => {
		expect(mergeSourceRecords([])).toEqual([]);
	});
});
