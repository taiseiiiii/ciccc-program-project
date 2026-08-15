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
router.use("/grades", gradeRoutes); // read-only master data (V0–V17)
router.use("/routes", routeRoutes);
router.use("/attempts", attemptRoutes);
router.use("/goals", goalRoutes);
router.use("/performances", performanceRoutes); // AI-generated performance reports
router.use("/trainings", trainingRoutes); // AI-generated training plans

export default router;
