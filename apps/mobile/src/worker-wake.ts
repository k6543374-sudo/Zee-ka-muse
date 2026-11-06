/**
 * Wake the sleeping free-tier browser worker from the client.
 *
 * Measured 2026-11-06 on this deployment (not asserted as universal Render
 * behavior): API-to-worker requests against the sleeping worker get an
 * instant proxy 502 and never boot it, while external requests - including
 * from this app - are held by the edge and boot it in ~42s. So the app, not
 * the API, must wake it. The ping is fire-and-forget: on web a CORS-blocked
 * response still means the request reached the edge; native fetch has no
 * CORS. Online state comes from the workspace snapshot, not this response.
 *
 * Bounded by design: at most one held ping per cold episode (an unbroken run
 * of snapshots showing the worker unavailable), never a keep-alive, so the
 * worker still sleeps when unused and free hours are untouched.
 */
const WAKE_HOLD_MS = 75_000; // cold boot measured ~42s; headroom, then give up

let inFlight: AbortController | null = null;
let episodeActive = false;

export function wakeWorkerOnce(wakeUrl: string | undefined, offline: boolean): void {
  if (!offline) {
    // Episode over (worker online or unconfigured): the next cold episode may wake again.
    episodeActive = false;
    inFlight?.abort();
    inFlight = null;
    return;
  }
  if (episodeActive) return; // one attempt per cold episode, deduped
  if (!wakeUrl || !wakeUrl.startsWith("https://")) return;
  episodeActive = true;
  const controller = new AbortController();
  inFlight = controller;
  const timer = setTimeout(() => controller.abort(), WAKE_HOLD_MS);
  // Allowlisted: the configured origin only, fixed unauthenticated path.
  fetch(`${wakeUrl}/health`, { signal: controller.signal })
    .catch(() => undefined) // CORS-opaque or network failure: the wake may still have landed
    .finally(() => {
      clearTimeout(timer);
      if (inFlight === controller) inFlight = null;
    });
}
