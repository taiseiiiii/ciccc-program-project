import { readFileSync } from "node:fs";
import path from "node:path";
import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";
import { env, isProduction } from "./config/env";
import apiRoutes from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";
import { requestLog } from "./middleware/requestLog";

// docs/ sits next to src/ in dev (tsx) and next to dist/ after build, so one
// level up from __dirname resolves correctly in both cases.
const OPENAPI_PATH = path.join(__dirname, "..", "docs", "openapi.yaml");

/** Build and configure the Express application (no network binding here). */
export function createApp(): Application {
  const app = express();

  // The platform terminates TLS and forwards through exactly one proxy, so the
  // client's real address is the first entry in X-Forwarded-For. Trusting that
  // header locally would let any caller claim any IP and walk straight through
  // the rate limiter, so it is only trusted where a proxy actually exists.
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  // The API answers on its own subdomain, so every call from the app is a
  // cross-origin one and each mutation costs a preflight first. `maxAge` lets
  // the browser remember the answer for a day instead of asking again before
  // every save — the difference is visible on a phone on gym wifi.
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86_400,
    }),
  );
  // Explicit rather than body-parser's implicit 100kb: a long session carries
  // dozens of climbs with notes, and the ceiling should be a number someone
  // chose. MAX_CLIMBS_PER_SESSION is the real bound; this is the backstop.
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLog);
  app.use(apiLimiter);

  app.get("/", (_req, res) => {
    res.json({
      name: "climb-app-server",
      version: "0.1.0",
      api: "/api/v1",
      docs: "/api/v1/docs",
    });
  });

  // API docs: interactive Swagger UI + the raw spec (for codegen / import).
  //
  // Read defensively. On a serverless platform the spec is a file that has to
  // be bundled alongside the compiled code, and a missing file here would take
  // the whole API down over documentation. Losing the docs is survivable;
  // failing to boot is not.
  let openapiYaml: string | null = null;
  try {
    openapiYaml = readFileSync(OPENAPI_PATH, "utf8");
  } catch (err) {
    console.error(`[server] API docs unavailable: could not read ${OPENAPI_PATH}`, err);
  }

  if (openapiYaml !== null) {
    const spec = openapiYaml;
    app.get("/api/v1/openapi.yaml", (_req, res) => {
      res.type("text/yaml").send(spec);
    });
    app.use(
      "/api/v1/docs",
      // Swagger UI injects its own inline script and styles, which the default
      // helmet CSP blocks outright — the page renders blank in production
      // without this. Relaxed for this one path only; the API itself keeps the
      // strict policy set above.
      helmet({
        contentSecurityPolicy: {
          directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:"],
          },
        },
      }),
      swaggerUi.serve,
      swaggerUi.setup(parseYaml(spec), {
        customSiteTitle: "Climb App API Docs",
      }),
    );
  }

  app.use("/api/v1", apiRoutes);

  // 404 + centralized error handling — must come after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
