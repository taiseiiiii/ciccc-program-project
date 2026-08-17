import { Router } from "express";
import { injuryController } from "../controllers/injury.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(injuryController.list));
router.post("/", asyncHandler(injuryController.create));
router.get("/:id", asyncHandler(injuryController.get));
router.patch("/:id", asyncHandler(injuryController.update));
router.delete("/:id", asyncHandler(injuryController.remove));

// Daily check-ins are nested: a pain reading has no meaning without its injury,
// and nesting keeps the ownership check on the parent.
router.get("/:id/logs", asyncHandler(injuryController.listLogs));
router.post("/:id/logs", asyncHandler(injuryController.createLog));

export default router;
