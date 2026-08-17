import { Router } from "express";
import { weaknessController } from "../controllers/weakness.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// No PATCH: renaming a label would silently rewrite the history of every climb
// already tagged with it. Delete and add instead.
router.get("/", asyncHandler(weaknessController.list));
router.post("/", asyncHandler(weaknessController.create));
router.delete("/:id", asyncHandler(weaknessController.remove));

export default router;
