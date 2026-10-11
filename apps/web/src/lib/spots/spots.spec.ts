import { describe, expect, it } from 'vitest';
import { getSpot, loadSpots, spots, type SpotType } from './index';

/**
 * Structural guards for the curated seed list. These are deliberately cheap —
 * they catch a bad hand edit (typo'd station id, missing coords, duplicate id)
 * without pretending to be a data audit against the upstream stations.
 */
const SO_CAL_BBOX = { minLat: 32.0, maxLat: 35.0, minLon: -121.0, maxLon: -116.0 };
const KNOWN_TYPES: SpotType[] = ['surf', 'dive', 'boat'];
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COOPS_RE = /^941\d{4}$/;
const CDIP_RE = /^\d{3}$/;

function insideBbox(lat: number, lon: number): boolean {
	return (
		lat >= SO_CAL_BBOX.minLat &&
		lat <= SO_CAL_BBOX.maxLat &&
		lon >= SO_CAL_BBOX.minLon &&
		lon <= SO_CAL_BBOX.maxLon
	);
}

describe('spots seed list', () => {
	it('has between 10 and 20 spots', () => {
		expect(spots.length).toBeGreaterThanOrEqual(10);
		expect(spots.length).toBeLessThanOrEqual(20);
	});

	it('has unique, URL-safe ids', () => {
		const ids = spots.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(ID_RE);
	});

	it('places every spot and model point inside a broad SoCal bbox', () => {
		for (const s of spots) {
			expect(insideBbox(s.lat, s.lon), `${s.id} is outside SoCal`).toBe(true);
			expect(
				insideBbox(s.offshoreModelPoint.lat, s.offshoreModelPoint.lon),
				`${s.id} model point is outside SoCal`
			).toBe(true);
		}
	});

	it('gives every spot a known type and spans all three use cases', () => {
		const seen = new Set<SpotType>();
		for (const s of spots) {
			expect(s.types.length, `${s.id} has no type`).toBeGreaterThan(0);
			for (const t of s.types) {
				expect(KNOWN_TYPES, `${s.id} has unknown type ${t}`).toContain(t);
				seen.add(t);
			}
		}
		expect([...seen].sort()).toEqual([...KNOWN_TYPES].sort());
	});

	it('fills in station ids and exposure in the expected formats', () => {
		for (const s of spots) {
			expect(s.name.length, `${s.id} has no name`).toBeGreaterThan(0);
			expect(s.region.length, `${s.id} has no region`).toBeGreaterThan(0);
			expect(s.coopsStationId ?? '', `${s.id} needs a CO-OPS station`).toMatch(COOPS_RE);
			if (s.cdipBuoyId !== undefined) {
				expect(s.cdipBuoyId, `${s.id} has a malformed CDIP id`).toMatch(CDIP_RE);
			}
			if (s.exposureDeg !== undefined) {
				expect(s.exposureDeg).toBeGreaterThanOrEqual(0);
				expect(s.exposureDeg).toBeLessThan(360);
			}
		}
	});

	it('exposes lookups that agree with the seed', () => {
		const [first] = spots;
		if (!first) throw new Error('seed list is empty');
		expect(loadSpots()).toBe(spots);
		expect(getSpot(first.id)).toBe(first);
		expect(getSpot('not-a-real-spot')).toBeUndefined();
	});
});
