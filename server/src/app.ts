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

  // Render terminates TLS and forwards through exactly one proxy, so the
  // client's real address is the first entry in X-Forwarded-For. Trusting that
  // header locally would let any caller claim any IP and walk straight through
  // the rate limiter, so it is only trusted where a proxy actually exists.
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json());
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
  const openapiYaml = readFileSync(OPENAPI_PATH, "utf8");
  app.get("/api/v1/openapi.yaml", (_req, res) => {
    res.type("text/yaml").send(openapiYaml);
  });
  app.use(
    "/api/v1/docs",
    swaggerUi.serve,
    swaggerUi.setup(parseYaml(openapiYaml), {
      customSiteTitle: "Climb App API Docs",
    }),
  );

  app.use("/api/v1", apiRoutes);

  // 404 + centralized error handling — must come after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
