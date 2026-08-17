import { Router } from "express";
import { taxonomyController } from "../controllers/taxonomy.controller";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * The three tag vocabularies share a controller but not a path — each is its
 * own collection as far as clients are concerned. Mounted individually in
 * routes/index.ts.
 */
export const wallTypeRoutes = Router();
wallTypeRoutes.get("/", asyncHandler(taxonomyController.listWallTypes));

export const holdTypeRoutes = Router();
holdTypeRoutes.get("/", asyncHandler(taxonomyController.listHoldTypes));

export const bodyPartRoutes = Router();
bodyPartRoutes.get("/", asyncHandler(taxonomyController.listBodyParts));
