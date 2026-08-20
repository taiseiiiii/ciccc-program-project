import { Router } from "express";
import { mediaController } from "../controllers/media.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// /usage before /:id — otherwise "usage" is parsed as an id and 400s.
router.get("/usage", asyncHandler(mediaController.usage));
router.get("/", asyncHandler(mediaController.list));
// Uploading is two steps: ask for a URL, PUT the file to it, then post the
// metadata. The file itself never travels through this server.
router.post("/presign", asyncHandler(mediaController.presign));
router.post("/", asyncHandler(mediaController.create));
// POST, not GET: a session's worth of object keys does not fit in a query
// string. It reads rather than creates.
router.post("/urls", asyncHandler(mediaController.signUrls));
// 200 with the object key rather than 204 — kept from when the client had to
// delete the file itself. The server does that now; the key stays in the
// response because callers use it to drop the thumbnail from their cache.
router.delete("/:id", asyncHandler(mediaController.remove));

export default router;
