import { Router } from "express";
import { performanceController } from "../controllers/performance.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(performanceController.list));
router.post("/", asyncHandler(performanceController.create));
router.get("/:id", asyncHandler(performanceController.get));
router.delete("/:id", asyncHandler(performanceController.remove));

export default router;
