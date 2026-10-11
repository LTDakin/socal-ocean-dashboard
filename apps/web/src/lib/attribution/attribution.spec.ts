import { describe, expect, it } from 'vitest';
import { CDIP_PROVIDER_ID } from '../providers/cdip';
import { COASTWATCH_PROVIDER_ID } from '../providers/coastwatch';
import { COOPS_PROVIDER_ID } from '../providers/coops';
import { COOPS_OBS_PROVIDER_ID } from '../providers/coops-obs';
import { GFSWAVE_PROVIDER_ID } from '../providers/gfswave';
import { NDBC_PROVIDER_ID } from '../providers/ndbc';
import {
	creditedProviders,
	creditForProvider,
	DATA_SOURCES,
	SAFETY_DISCLAIMER,
	SHORT_DISCLAIMER,
	sourceNames
} from './index';

/** The ids the registry actually registers (mirrors `providers/registry.ts`). */
const REGISTERED_PROVIDER_IDS = [
	GFSWAVE_PROVIDER_ID,
	COOPS_PROVIDER_ID,
	CDIP_PROVIDER_ID,
	NDBC_PROVIDER_ID,
	COOPS_OBS_PROVIDER_ID,
	COASTWATCH_PROVIDER_ID
];

describe('attribution', () => {
	it('covers every registered provider id', () => {
		for (const id of REGISTERED_PROVIDER_IDS) {
			expect(creditForProvider(id), `no credit for provider "${id}"`).toBeDefined();
		}
	});

	it('does not credit any provider id twice', () => {
		const ids = creditedProviders();
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives every credit a name, URL, and license', () => {
		for (const source of DATA_SOURCES) {
			expect(source.name.length, source.id).toBeGreaterThan(0);
			expect(source.url, source.id).toMatch(/^https?:\/\//);
			expect(source.license.length, source.id).toBeGreaterThan(0);
			expect(source.providers.length, source.id).toBeGreaterThan(0);
		}
	});

	it('builds a non-empty source roll-up', () => {
		expect(sourceNames().length).toBeGreaterThan(0);
		expect(SAFETY_DISCLAIMER.length).toBeGreaterThan(0);
		expect(SHORT_DISCLAIMER.length).toBeGreaterThan(0);
	});
});
