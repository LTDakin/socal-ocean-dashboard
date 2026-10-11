import spotsData from './spots.json';

/** The ocean use cases a spot supports. */
export type SpotType = 'surf' | 'dive';

/** A deep-water model sample point for the offshore wave forecast. */
export interface ModelPoint {
	lat: number;
	lon: number;
}

/**
 * A curated Southern California ocean spot.
 *
 * Canonical data model: `docs/data-sources.md`. Seed contents: `spots.json`.
 */
export interface Spot {
	id: string;
	name: string;
	region: string;
	lat: number;
	lon: number;
	types: SpotType[];
	/** Deep-water GFS-Wave sample point offshore of the spot. */
	offshoreModelPoint: ModelPoint;
	/** Nearest CDIP buoy for real-time observations, if one exists. */
	cdipBuoyId?: string;
	/** NOAA CO-OPS tide / water-level station. */
	coopsStationId?: string;
	/** Compass heading of the open-ocean direction the spot faces (surf score). */
	exposureDeg?: number;
	/** Pre-marked as a dashboard favorite. */
	favoriteSeed?: boolean;
}

/** The curated seed list. */
export const spots: Spot[] = spotsData as Spot[];

const byId = new Map(spots.map((spot) => [spot.id, spot]));

/** All curated spots. */
export function loadSpots(): Spot[] {
	return spots;
}

/** Look up a single spot by id, or `undefined` if it is not curated. */
export function getSpot(id: string): Spot | undefined {
	return byId.get(id);
}
