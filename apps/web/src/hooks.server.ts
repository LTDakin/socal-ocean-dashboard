import { dev } from '$app/env';
import { prewarmProviderCache } from './lib/providers/prewarm';

/**
 * `hooks.server.ts` — pre-warm the provider cache at boot (see
 * `docs/architecture.md` → "Pre-warm" and `docs/plan-perf-initial-load.md`).
 *
 * The very first request to a cold process pays the full upstream fan-out
 * (~18 s for `/api/spots`, ~8 s for a detail forecast). Warming in the
 * background makes the first real visitor a cache hit.
 *
 * `init` is awaited before the first request, so it must return immediately:
 * the work is fired off detached.
 */

/** Process-wide "already warming" marker. On `globalThis` so dev HMR can't re-trigger it. */
const PREWARM_KEY = '__soCalOceanPrewarmed__';

/** `PREWARM=1|true|on` forces on, `PREWARM=0|false|off` forces off; otherwise prod only. */
function prewarmEnabled(): boolean {
	const flag = process.env.PREWARM?.trim().toLowerCase();
	if (flag === '1' || flag === 'true' || flag === 'on') return true;
	if (flag === '0' || flag === 'false' || flag === 'off') return false;
	return !dev;
}

export function init(): void {
	if (!prewarmEnabled()) return;

	const scope = globalThis as unknown as Record<string, unknown>;
	if (scope[PREWARM_KEY]) return;
	scope[PREWARM_KEY] = true;

	void prewarmProviderCache()
		.then((result) => {
			console.info(
				`[prewarm] warmed ${result.overviewSpots} spot(s); forecast ${
					result.forecastSpotId ?? 'unavailable'
				}`
			);
		})
		.catch((cause) => {
			console.warn('[prewarm] failed', cause);
		});
}
