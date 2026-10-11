/**
 * `lib/derive/clarity.ts` — satellite water-clarity derivation.
 *
 * There is no forecast for underwater visibility, so the clarity service shows
 * the latest *observed* satellite product, labeled as such. VIIRS gives us the
 * diffuse attenuation coefficient `Kd490` (m⁻¹); we convert it to a Secchi
 * depth and bucket it into a coarse rating band for the UI.
 *
 * Pure and side-effect free — kept in `lib/derive` (not the CoastWatch adapter)
 * so the thresholds can be reasoned about and unit-tested in isolation, per
 * `AGENTS.md`.
 */

/** Coarse visibility band shown to users. */
export type ClarityRating = 'poor' | 'fair' | 'good' | 'excellent';

/** One rating band: values `>= minSecchiM` (and below the next band) land here. */
export interface ClarityBand {
	rating: ClarityRating;
	/** Lower bound of the band, in metres of Secchi depth (inclusive). */
	minSecchiM: number;
}

/**
 * Bands in descending order; the first whose `minSecchiM` a depth meets wins.
 * Thresholds are the "neat-appearing" ones called out in `docs/data-sources.md`
 * (`<5 m poor … >20 m excellent`).
 */
export const CLARITY_BANDS: readonly ClarityBand[] = [
	{ rating: 'excellent', minSecchiM: 20 },
	{ rating: 'good', minSecchiM: 10 },
	{ rating: 'fair', minSecchiM: 5 },
	{ rating: 'poor', minSecchiM: 0 }
];

/** Kirk's empirical relation: Secchi depth (m) ≈ 1.44 / Kd490 (m⁻¹). */
export const SECCHI_KD_COEFFICIENT = 1.44;

/** A fully derived clarity observation. All fields are `null` when unknown. */
export interface ClaritySummary {
	/** Diffuse attenuation at 490 nm (m⁻¹), as observed. */
	kd490: number | null;
	/** Secchi depth (m) derived via Kirk. */
	secchiDepthM: number | null;
	/** Coarse band for display, or `null` when unobserved. */
	rating: ClarityRating | null;
}

/**
 * Secchi depth (m) from `Kd490` (m⁻¹), or `null` when it can't be derived.
 *
 * Only finite, strictly positive `Kd490` yields a depth — a `0` or missing
 * satellite pixel would otherwise blow up or read as perfect clarity.
 */
export function secchiDepthM(kd490: number | null | undefined): number | null {
	if (kd490 === null || kd490 === undefined) return null;
	if (!Number.isFinite(kd490) || kd490 <= 0) return null;
	return SECCHI_KD_COEFFICIENT / kd490;
}

/** Rating band for a Secchi depth, or `null` when it can't be rated. */
export function clarityRating(secchiM: number | null | undefined): ClarityRating | null {
	if (secchiM === null || secchiM === undefined || !Number.isFinite(secchiM) || secchiM < 0) {
		return null;
	}
	return CLARITY_BANDS.find((band) => secchiM >= band.minSecchiM)?.rating ?? null;
}

/** Derive Secchi depth + rating from a `Kd490` observation in one call. */
export function deriveClarity(kd490: number | null | undefined): ClaritySummary {
	const depth = secchiDepthM(kd490);
	return {
		kd490: kd490 !== null && kd490 !== undefined && Number.isFinite(kd490) ? kd490 : null,
		secchiDepthM: depth,
		rating: clarityRating(depth)
	};
}
