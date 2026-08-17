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

// Everything below requires a valid Supabase access token.
router.use(requireAuth);

router.use("/users", userRoutes); // GET /users/me
router.use("/sessions", sessionRoutes);
router.use("/attempts", attemptRoutes);
router.use("/routes", routeRoutes);
router.use("/goals", goalRoutes);

// Read-only master data. Clients cache these for the life of the page — they
// only ever change when a migration changes them.
router.use("/grades", gradeRoutes); // V0–V17
router.use("/wall-types", wallTypeRoutes); // slab .. dihedral
router.use("/hold-types", holdTypeRoutes); // jug .. volume
router.use("/body-parts", bodyPartRoutes); // finger .. ankle

router.use("/weaknesses", weaknessRoutes); // presets + the climber's own labels
router.use("/media", mediaRoutes); // photo/video metadata (files live in Storage)
router.use("/injuries", injuryRoutes); // injuries + daily pain check-ins
router.use("/performances", performanceRoutes); // AI-generated performance reports
router.use("/trainings", trainingRoutes); // AI-generated training plans

export default router;
