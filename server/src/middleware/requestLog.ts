import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { isProduction } from "../config/env";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlates the access-log line, the error log and the error response. */
      id?: string;
    }
  }
}

/**
 * One log line per request, plus an id to tie it to anything that goes wrong.
 *
 * Hand-rolled rather than pulling in morgan or pino, for the same reason the
 * OpenAI call uses plain fetch: this needs one line of output and a correlation
 * id, and a logging framework is a dependency, a config surface and a set of
 * defaults to argue with. If structured shipping to a log service is ever
 * needed, swap this for pino then — the id is the part that matters, and it is
 * already on `req`.
 *
 * Production emits JSON (one object per line, greppable by field on Render);
 * development emits something a human reads at a glance.
 *
 * What is deliberately not logged: request bodies and query strings. They carry
 * gym names, climbing notes and injury descriptions, and an access log is the
 * wrong place for any of that.
 */
export const requestLog: RequestHandler = (req, res, next) => {
  const id = req.header("x-request-id") ?? randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const line = {
      id,
      method: req.method,
      // route path (`/sessions/:id`), not the URL, so ids do not fragment the
      // logs into one bucket per row.
      path: req.baseUrl + (req.route?.path ?? req.path),
      status: res.statusCode,
      ms: Math.round(ms),
      user: req.user?.user_id,
    };

    if (isProduction) {
      console.log(JSON.stringify({ t: "req", ...line }));
      return;
    }
    console.log(
      `[req] ${line.method} ${line.path} ${line.status} ${line.ms}ms` +
        (line.user === undefined ? "" : ` user=${line.user}`) +
        ` ${id.slice(0, 8)}`,
    );
  });

  next();
};
