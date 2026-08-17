import { Router } from "express";
import { mediaController } from "../controllers/media.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// /usage before /:id — otherwise "usage" is parsed as an id and 400s.
router.get("/usage", asyncHandler(mediaController.usage));
router.get("/", asyncHandler(mediaController.list));
router.post("/", asyncHandler(mediaController.create));
// DELETE answers 200 with the object key rather than 204: the client still has
// to remove the file from the bucket, and it needs the key to do it.
router.delete("/:id", asyncHandler(mediaController.remove));

export default router;
