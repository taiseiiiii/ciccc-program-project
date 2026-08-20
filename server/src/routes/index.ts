import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { pingDatabase } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import userRoutes from "./user.routes";
import sessionRoutes from "./session.routes";
import gradeRoutes from "./grade.routes";
import routeRoutes from "./route.routes";
import attemptRoutes from "./attempt.routes";
import goalRoutes from "./goal.routes";
import performanceRoutes from "./performance.routes";
import trainingRoutes from "./training.routes";
import weaknessRoutes from "./weakness.routes";
import mediaRoutes from "./media.routes";
import injuryRoutes from "./injury.routes";
import statsRoutes from "./stats.routes";
import {
  wallTypeRoutes,
  holdTypeRoutes,
  bodyPartRoutes,
} from "./taxonomy.routes";

const router = Router();

/**
 * Health check. Reports server liveness and database connectivity.
 * GET /api/v1/health
 */
router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const dbUp = await pingDatabase();
    res.status(dbUp ? 200 : 503).json({
      status: "ok",
      db: dbUp ? "up" : "down",
    });
  }),
);

/**
 * Every resource below requires a valid Supabase access token.
 *
 * Applied per mount rather than as one `router.use(requireAuth)` above them.
 * A blanket use() runs before routing, so it also caught paths that match no
 * resource at all — `GET /api/v1/nope` answered 401, the 404 handler was
 * unreachable for the whole API, and a typo'd URL looked like an auth problem.
 * Mounting it per resource means an unknown path falls through to notFound and
 * says so.
 */
router.use("/users", requireAuth, userRoutes); // GET /users/me
router.use("/sessions", requireAuth, sessionRoutes);
router.use("/attempts", requireAuth, attemptRoutes);
router.use("/routes", requireAuth, routeRoutes);
router.use("/goals", requireAuth, goalRoutes);

// Read-only master data. Clients cache these for the life of the page — they
// only ever change when a migration changes them.
router.use("/grades", requireAuth, gradeRoutes); // V0–V17
router.use("/wall-types", requireAuth, wallTypeRoutes); // slab .. dihedral
router.use("/hold-types", requireAuth, holdTypeRoutes); // jug .. volume
router.use("/body-parts", requireAuth, bodyPartRoutes); // finger .. ankle

router.use("/weaknesses", requireAuth, weaknessRoutes); // presets + the climber's own labels
router.use("/media", requireAuth, mediaRoutes); // photo/video metadata (files live in Storage)
router.use("/injuries", requireAuth, injuryRoutes); // injuries + daily pain check-ins
router.use("/stats", requireAuth, statsRoutes); // counted-up figures for the charts

// The two AI resources. Their POSTs each cost a paid model call, so those two
// verbs carry an extra limiter — applied inside the routers, not here, so that
// reading a saved report never spends the generation budget.
router.use("/performances", requireAuth, performanceRoutes);
router.use("/trainings", requireAuth, trainingRoutes);

export default router;
