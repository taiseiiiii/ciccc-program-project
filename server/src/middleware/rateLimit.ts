import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request } from "express";

/**
 * Rate limits.
 *
 * Two buckets, because two different things are being protected:
 *
 *   * `apiLimiter` — the ordinary API. Generous; it exists so a runaway client
 *     or a scraper cannot saturate a single free-tier instance.
 *   * `aiLimiter`  — POST /performances and POST /trainings. Each of those is
 *     one paid model call, so this one is tight. It is the only limit here
 *     whose absence could produce a bill rather than a slow afternoon.
 *
 * The AI bucket is keyed by the authenticated user: `requireAuth` runs before
 * it, so `req.user` is always set there, and keying on IP instead would put a
 * whole gym's wifi in one bucket. The global limiter sits in front of auth and
 * keys on IP by default.
 *
 * Deliberately NOT added: de-duplicating "you already generated this period".
 * Regenerating a monthly report after logging three more sessions is exactly
 * what the button promises to do, and quietly handing back the stale one would
 * read as the button being broken. The limit above is the cost control.
 */

/** Shared response shape, so a 429 looks like every other error from this API. */
function limitDefaults(message: string): Partial<Options> {
  return {
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { message } },
  };
}

/**
 * User id when authenticated, otherwise the caller's IP.
 * `ipKeyGenerator` normalises IPv6 to a /56 block, so one client cannot walk
 * through its own address range to get a fresh bucket each request.
 */
function keyByUser(req: Request): string {
  return req.user ? `u:${req.user.user_id}` : ipKeyGenerator(req.ip ?? "");
}

/**
 * Health checks are how the platform finds out the server is alive, and Render
 * polls one continuously. Counting those against a shared IP bucket would make
 * an outage look worse than it is.
 *
 * Matched against the full path, not `/health`: this limiter is mounted at the
 * app root rather than under the API router, so `req.path` is the whole
 * `/api/v1/health`. The shorter form silently never matched.
 */
const HEALTH_PATH = "/api/v1/health";

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  ...limitDefaults("Too many requests — slow down and try again in a minute"),
  skip: (req) => req.path === HEALTH_PATH,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  keyGenerator: keyByUser,
  ...limitDefaults(
    "You have generated a lot of AI reports in the last hour — try again shortly",
  ),
});
