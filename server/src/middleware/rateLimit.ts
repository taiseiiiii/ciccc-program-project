import rateLimit, { type Options } from "express-rate-limit";

/**
 * The general API rate limit.
 *
 * Generous by design: it exists so a runaway client or a scraper cannot
 * saturate a single instance, not to ration ordinary use. The store is
 * in-memory, so on a serverless runtime each instance counts on its own and a
 * restart clears the tally — acceptable here, because the cost of letting a few
 * extra requests through is a little CPU.
 *
 * The limit that actually protects money — the one on paid model calls — is
 * deliberately NOT here. It lives in ./aiQuota.ts and counts rows in the
 * database, because an in-memory count of those would reset itself away.
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
 * Health checks are how the platform finds out the server is alive, and they
 * are polled continuously. Counting those against a shared IP bucket would make
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
