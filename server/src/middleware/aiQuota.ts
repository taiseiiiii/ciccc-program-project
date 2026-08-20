import type { NextFunction, Request, Response } from "express";
import { query } from "../db/pool";
import { HttpError } from "../utils/HttpError";

/**
 * The spending limit on the AI endpoints.
 *
 * This used to be an in-memory `express-rate-limit` bucket, which counted
 * correctly right up until the process restarted — and then handed everyone a
 * fresh allowance. On a serverless runtime that is not an edge case: instances
 * are created and discarded continuously, and several run at once, so an
 * in-process counter is closer to no limit at all. It was also the only limit
 * in the app whose absence produces a bill rather than a slow afternoon.
 *
 * The generated rows are themselves the ledger. Every successful generation
 * inserts exactly one row into `performances` or `trainings` with a
 * `created_at`, so counting those rows over the last hour asks the database the
 * same question the bucket was approximating, and gets an answer that survives
 * a restart and is shared by every instance.
 *
 * The two tables share one allowance, matching the old behaviour: both spend
 * from the same OpenAI account.
 */
const WINDOW_HOURS = 1;
const MAX_PER_WINDOW = 10;

/**
 * Counts rows the caller created in the window. Both subqueries hit
 * `(user_id, created_at DESC)` (migration 0011), so this is two index scans in
 * front of a request that is about to spend ten seconds in the model.
 */
const COUNT_SQL = `
  SELECT (
      (SELECT count(*) FROM performances
        WHERE user_id = $1 AND created_at > now() - ($2 || ' hours')::interval)
    + (SELECT count(*) FROM trainings
        WHERE user_id = $1 AND created_at > now() - ($2 || ' hours')::interval)
  ) AS used
`;

/**
 * Rejects a generation request once the climber has made MAX_PER_WINDOW of them
 * in the last hour. Mounted after `requireAuth`, so `req.user` is always set.
 */
export async function aiQuota(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.user_id;
    // Belt and braces: the route mounts this behind requireAuth. Without a
    // caller there is nothing to count, and failing open on a paid endpoint is
    // the one outcome worth refusing outright.
    if (userId === undefined) {
      next(HttpError.unauthorized());
      return;
    }

    const result = await query<{ used: string }>(COUNT_SQL, [
      userId,
      String(WINDOW_HOURS),
    ]);
    const used = Number(result.rows[0]?.used ?? 0);

    if (used >= MAX_PER_WINDOW) {
      next(
        HttpError.tooManyRequests(
          "You have generated a lot of AI reports in the last hour — try again shortly",
        ),
      );
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}
