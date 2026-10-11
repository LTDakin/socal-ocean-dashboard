/**
 * `lib/providers/current.ts` — the `/current` observation merge.
 *
 * Adapters fetch one source each (`cdip`, `ndbc`, `coops-obs`); this module
 * decides which source wins each field and records where every number came from.
 * Rules are deliberately per-field, because sources fail independently:
 *
 * - **Waves** — the newest reading wins (CDIP then NDBC on ties). A lagging CDIP
 *   buoy is filled by its NDBC twin (and vice versa); a null sub-field (say
 *   `waveDp`) doesn't discard the fields that are present.
 * - **Water temp** — the buoy (NDBC) when it reports, else the pier sensor
 *   (CO-OPS): representativeness beats a couple of hours of recency.
 * - **Wind** — the newest reading wins (NDBC then CO-OPS on ties), and speed and
 *   direction always come from the same station (never mixed).
 * - **Water level / tide state** — CO-OPS only.
 *
 * Observations are windowed on an hour boundary so the `provider:spotId:window`
 * cache key is stable within the hour while the values stay "now"; freshness is
 * reported per field from each value's real `observedAt` (`docs/api-contracts.md`).
 */
import type { CdipObservations } from './cdip';
import type { CoopsObservations } from './coops-obs';
import type { NdbcObservations } from './ndbc';
import { ProviderError, type ForecastWindow } from './types';

const HOUR_MS = 60 * 60 * 1000;

/** How far back an observation may be and still count as "now". */
export const OBSERVATION_LOOKBACK_MS = 3 * HOUR_MS;

/**
 * The observation window: `OBSERVATION_LOOKBACK_MS` back from the next hour
 * boundary.
 *
 * Quantizing to the hour keeps the cache key stable across requests in the same
 * hour (fresh data still wins by `observedAt`, not by window).
 */
export function observationWindow(now: number = Date.now()): ForecastWindow {
	const endMs = Math.ceil(now / HOUR_MS) * HOUR_MS;
	return {
		start: new Date(endMs - OBSERVATION_LOOKBACK_MS).toISOString(),
		end: new Date(endMs).toISOString()
	};
}

/** The per-field keys `/current` can attribute. */
export type CurrentField =
	| 'waveHeightM'
	| 'wavePeriodS'
	| 'waveDirDeg'
	| 'waterTempC'
	| 'windSpeedMs'
	| 'windDirDeg'
	| 'waterLevelM'
	| 'tideState';

/** Where one field's value came from. */
export interface FieldProvenance {
	provider: string;
	stationId: string;
	/** Upstream observation time, ISO-8601 UTC. */
	observedAt: string;
	/** Age at payload time, seconds. */
	ageSeconds: number;
}

/** The `/current` payload: a "now" snapshot with per-field provenance. */
export interface CurrentConditions {
	spotId: string;
	/** Newest field observation, or `null` when nothing is available. */
	observedAt: string | null;
	waveHeightM: number | null;
	/** Peak (CDIP) / dominant (NDBC) period, seconds. */
	wavePeriodS: number | null;
	waveDirDeg: number | null;
	waterTempC: number | null;
	windSpeedMs: number | null;
	windDirDeg: number | null;
	/** Water level relative to MLLW, meters. */
	waterLevelM: number | null;
	tideState: 'rising' | 'falling' | 'steady' | null;
	fields: Partial<Record<CurrentField, FieldProvenance>>;
}

/** The raw adapter payloads, keyed by provider id (`getSpotData` bundle). */
export interface ObservationBundle {
	cdip?: CdipObservations;
	ndbc?: NdbcObservations;
	'coops-obs'?: CoopsObservations;
}

interface FieldCandidate {
	provider: string;
	stationId: string;
	observedAt: string;
	value: number | null;
}

interface PickedField {
	value: number;
	provenance: FieldProvenance;
}

function ageSeconds(observedAt: string, now: number): number {
	return Math.max(0, Math.round((now - Date.parse(observedAt)) / 1000));
}

function provenanceOf(candidate: FieldCandidate, now: number): FieldProvenance {
	return {
		provider: candidate.provider,
		stationId: candidate.stationId,
		observedAt: candidate.observedAt,
		ageSeconds: ageSeconds(candidate.observedAt, now)
	};
}

/** Candidates newest-first; ties keep the order given (provider preference). */
function byNewest<T extends FieldCandidate>(candidates: T[]): T[] {
	return [...candidates].sort((a, b) =>
		a.observedAt < b.observedAt ? 1 : a.observedAt > b.observedAt ? -1 : 0
	);
}

/** Newest non-null value wins; `candidates` arrive in preference order. */
function pickField(candidates: FieldCandidate[], now: number): PickedField | null {
	const usable = candidates.filter(
		(candidate): candidate is FieldCandidate & { value: number } => candidate.value !== null
	);
	const best = byNewest(usable)[0];
	if (!best) return null;
	return { value: best.value, provenance: provenanceOf(best, now) };
}

/**
 * Preference order wins (the first non-null candidate), regardless of age.
 *
 * Used where representativeness beats a couple of hours of recency — a buoy SST
 * describes the spot's water better than a shore/pier sensor, and every
 * candidate is inside the observation window by construction.
 */
function pickPreferred(candidates: FieldCandidate[], now: number): PickedField | null {
	const best = candidates.find(
		(candidate): candidate is FieldCandidate & { value: number } => candidate.value !== null
	);
	if (!best) return null;
	return { value: best.value, provenance: provenanceOf(best, now) };
}

/** Wave-field candidates in preference order: CDIP, then its NDBC twin. */
function waveCandidates(
	bundle: ObservationBundle,
	field: 'waveHeightM' | 'wavePeriodS' | 'waveDirDeg'
): FieldCandidate[] {
	const candidates: FieldCandidate[] = [];
	if (bundle.cdip?.observation && bundle.cdip.stationId) {
		candidates.push({
			provider: 'cdip',
			stationId: bundle.cdip.stationId,
			observedAt: bundle.cdip.observation.observedAt,
			value: bundle.cdip.observation[field]
		});
	}
	if (bundle.ndbc?.observation && bundle.ndbc.stationId) {
		candidates.push({
			provider: 'ndbc',
			stationId: bundle.ndbc.stationId,
			observedAt: bundle.ndbc.observation.observedAt,
			value: bundle.ndbc.observation[field]
		});
	}
	return candidates;
}

/** Wind sources in preference order (NDBC, then CO-OPS), speed + direction together. */
function windSources(bundle: ObservationBundle) {
	const sources: (FieldCandidate & { windDirDeg: number | null })[] = [];
	if (bundle.ndbc?.observation && bundle.ndbc.stationId) {
		sources.push({
			provider: 'ndbc',
			stationId: bundle.ndbc.stationId,
			observedAt: bundle.ndbc.observation.observedAt,
			value: bundle.ndbc.observation.windSpeedMs,
			windDirDeg: bundle.ndbc.observation.windDirDeg
		});
	}
	const coops = bundle['coops-obs'];
	if (coops?.stationId && coops.windObservedAt) {
		sources.push({
			provider: 'coops-obs',
			stationId: coops.stationId,
			observedAt: coops.windObservedAt,
			value: coops.windSpeedMs,
			windDirDeg: coops.windDirDeg
		});
	}
	return sources;
}

/**
 * Merge the adapter payloads into the `current` contract.
 *
 * Throws `not_found` when no source produced a single usable field, so the route
 * can 404 instead of serving an all-null snapshot.
 */
export function buildCurrentConditions(params: {
	spotId: string;
	bundle: ObservationBundle;
	now?: number;
}): CurrentConditions {
	const now = params.now ?? Date.now();
	const { bundle } = params;
	const coops = bundle['coops-obs'];

	const load = pickField(waveCandidates(bundle, 'waveHeightM'), now);
	const period = pickField(waveCandidates(bundle, 'wavePeriodS'), now);
	const direction = pickField(waveCandidates(bundle, 'waveDirDeg'), now);

	const tempCandidates: FieldCandidate[] = [];
	if (bundle.ndbc?.observation && bundle.ndbc.stationId) {
		tempCandidates.push({
			provider: 'ndbc',
			stationId: bundle.ndbc.stationId,
			observedAt: bundle.ndbc.observation.observedAt,
			value: bundle.ndbc.observation.waterTempC
		});
	}
	if (coops?.stationId && coops.waterTempObservedAt) {
		tempCandidates.push({
			provider: 'coops-obs',
			stationId: coops.stationId,
			observedAt: coops.waterTempObservedAt,
			value: coops.waterTempC
		});
	}
	const waterTemp = pickPreferred(tempCandidates, now);

	const wind = byNewest(
		windSources(bundle).filter(
			(source): source is FieldCandidate & { value: number; windDirDeg: number | null } =>
				source.value !== null
		)
	)[0];

	const waterLevel: PickedField | null =
		coops?.stationId && coops.waterLevel
			? {
					value: coops.waterLevel.waterLevelM,
					provenance: provenanceOf(
						{
							provider: 'coops-obs',
							stationId: coops.stationId,
							observedAt: coops.waterLevel.observedAt,
							value: coops.waterLevel.waterLevelM
						},
						now
					)
				}
			: null;

	const fields: CurrentConditions['fields'] = {};
	if (load) fields.waveHeightM = load.provenance;
	if (period) fields.wavePeriodS = period.provenance;
	if (direction) fields.waveDirDeg = direction.provenance;
	if (waterTemp) fields.waterTempC = waterTemp.provenance;
	if (wind) {
		fields.windSpeedMs = provenanceOf(wind, now);
		// Direction comes from the same station as the speed, never a different one.
		if (wind.windDirDeg !== null) {
			fields.windDirDeg = provenanceOf({ ...wind, value: wind.windDirDeg }, now);
		}
	}
	if (waterLevel) fields.waterLevelM = waterLevel.provenance;
	if (coops?.stationId && coops.waterLevel) {
		fields.tideState = provenanceOf(
			{
				provider: 'coops-obs',
				stationId: coops.stationId,
				observedAt: coops.waterLevel.observedAt,
				value: null
			},
			now
		);
	}

	const fieldCount = Object.keys(fields).length;
	if (fieldCount === 0) {
		throw new ProviderError(`No real-time observations available for ${params.spotId}`, {
			code: 'not_found',
			retryable: false
		});
	}

	let observedAt: string | null = null;
	for (const provenance of Object.values(fields)) {
		if (!provenance) continue;
		if (!observedAt || provenance.observedAt > observedAt) observedAt = provenance.observedAt;
	}

	return {
		spotId: params.spotId,
		observedAt,
		waveHeightM: load?.value ?? null,
		wavePeriodS: period?.value ?? null,
		waveDirDeg: direction?.value ?? null,
		waterTempC: waterTemp?.value ?? null,
		windSpeedMs: wind?.value ?? null,
		windDirDeg: wind?.windDirDeg ?? null,
		waterLevelM: waterLevel?.value ?? null,
		tideState: coops?.stationId && coops.waterLevel ? coops.waterLevel.tideState : null,
		fields
	};
}
