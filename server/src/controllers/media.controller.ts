import type { Request, Response } from "express";
import { mediaRepository } from "../repositories/media.repository";
import { sessionRepository } from "../repositories/session.repository";
import { attemptRepository } from "../repositories/attempt.repository";
import { HttpError } from "../utils/HttpError";
import { optionalInt, parseId, requireInt } from "../utils/validate";

/**
 * HTTP layer for photo/video attachments.
 *
 * This endpoint never receives a file. The browser uploads straight to
 * Supabase Storage with the climber's own token, then posts the resulting
 * object key here — so the server stays a metadata service and a 40 MB video
 * never has to fit through a free-tier request.
 *
 * Which means the interesting validation is not "is this a valid image" but
 * "is this key plausibly yours, and are you within your quota":
 *
 *   * the key must start with the caller's auth_user_id, matching the bucket
 *     RLS policy — a client that lies here is claiming someone else's object
 *   * the declared size is checked against per-file and per-account ceilings,
 *     because the bucket is one shared free-tier gigabyte
 *
 * Size is self-reported, so these are guard rails against ordinary misuse, not
 * a security boundary; the bucket's own file-size limit is the hard stop.
 */

// Per-file ceilings. Photos are resized client-side before upload, so anything
// this large means the resize was skipped.
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_VIDEO_SECONDS = 120;

// Per-account ceiling. The free tier gives the whole project 1 GB; this keeps
// one enthusiastic climber from consuming it for everybody.
const MAX_ACCOUNT_BYTES = 200 * 1024 * 1024; // 200 MB

const ALLOWED_MIME: Record<"photo" | "video", string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
};

export const mediaController = {
  // GET /api/v1/media          (optionally ?session_id= or ?attempt_id=)
  async list(req: Request, res: Response): Promise<void> {
    const sessionId =
      req.query.session_id === undefined
        ? undefined
        : parseId(String(req.query.session_id), "session_id");
    const attemptId =
      req.query.attempt_id === undefined
        ? undefined
        : parseId(String(req.query.attempt_id), "attempt_id");

    const media = await mediaRepository.findAll(req.user!.user_id, {
      sessionId,
      attemptId,
    });
    res.json({ data: media });
  },

  // GET /api/v1/media/usage
  // What the upload UI needs to warn before a climber hits the ceiling.
  async usage(req: Request, res: Response): Promise<void> {
    const used = await mediaRepository.totalBytes(req.user!.user_id);
    res.json({
      data: {
        used_bytes: used,
        limit_bytes: MAX_ACCOUNT_BYTES,
        max_photo_bytes: MAX_PHOTO_BYTES,
        max_video_bytes: MAX_VIDEO_BYTES,
        max_video_seconds: MAX_VIDEO_SECONDS,
      },
    });
  },

  // POST /api/v1/media
  // Body: { storage_path, kind, mime_type, byte_size, session_id?, attempt_id?, duration_seconds? }
  async create(req: Request, res: Response): Promise<void> {
    const {
      storage_path,
      kind,
      mime_type,
      byte_size,
      session_id,
      attempt_id,
      duration_seconds,
    } = req.body ?? {};

    if (kind !== "photo" && kind !== "video") {
      throw HttpError.badRequest("kind is required and must be 'photo' or 'video'");
    }
    // req.body is `any`, so the check above narrows nothing on its own.
    const mediaKind: "photo" | "video" = kind;

    if (typeof storage_path !== "string" || storage_path.trim() === "") {
      throw HttpError.badRequest("storage_path is required");
    }
    if (typeof mime_type !== "string" || !ALLOWED_MIME[mediaKind].includes(mime_type)) {
      throw HttpError.badRequest(
        `mime_type must be one of: ${ALLOWED_MIME[mediaKind].join(", ")}`,
      );
    }
    if (typeof byte_size !== "number" || !Number.isInteger(byte_size) || byte_size <= 0) {
      throw HttpError.badRequest("byte_size is required and must be a positive integer");
    }

    // The bucket policy grants write only under "<auth_user_id>/", so a key
    // outside that prefix could not have been uploaded by this caller.
    const prefix = `${req.user!.auth_user_id}/`;
    if (!storage_path.startsWith(prefix)) {
      throw HttpError.badRequest(
        "storage_path must start with your own user folder",
      );
    }

    const maxBytes = mediaKind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
    if (byte_size > maxBytes) {
      throw HttpError.unprocessable(
        `${mediaKind === "photo" ? "Photos" : "Videos"} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`,
      );
    }

    const duration = optionalInt(duration_seconds, "duration_seconds", {
      min: 1,
      max: MAX_VIDEO_SECONDS,
    });
    if (mediaKind === "video" && duration === undefined) {
      throw HttpError.badRequest("duration_seconds is required for videos");
    }

    // An attachment has to belong to something, and that something has to be
    // the caller's — otherwise a photo could be pinned to a stranger's session.
    const sessionIdValue =
      session_id === undefined || session_id === null
        ? undefined
        : requireInt(session_id, "session_id");
    const attemptIdValue =
      attempt_id === undefined || attempt_id === null
        ? undefined
        : requireInt(attempt_id, "attempt_id");

    if (sessionIdValue === undefined && attemptIdValue === undefined) {
      throw HttpError.badRequest(
        "Attach the file to a session_id or an attempt_id",
      );
    }
    if (sessionIdValue !== undefined) {
      const session = await sessionRepository.findById(
        sessionIdValue,
        req.user!.user_id,
      );
      if (!session) throw HttpError.notFound(`Session ${sessionIdValue} not found`);
    }
    if (attemptIdValue !== undefined) {
      const attempt = await attemptRepository.findById(
        attemptIdValue,
        req.user!.user_id,
      );
      if (!attempt) throw HttpError.notFound(`Attempt ${attemptIdValue} not found`);
    }

    const used = await mediaRepository.totalBytes(req.user!.user_id);
    if (used + byte_size > MAX_ACCOUNT_BYTES) {
      throw HttpError.unprocessable(
        `Storage limit reached (${Math.round(MAX_ACCOUNT_BYTES / 1024 / 1024)} MB). Delete some photos or videos first.`,
      );
    }

    const media = await mediaRepository.create({
      user_id: req.user!.user_id,
      session_id: sessionIdValue ?? null,
      attempt_id: attemptIdValue ?? null,
      storage_path,
      kind: mediaKind,
      mime_type,
      byte_size,
      duration_seconds: duration ?? null,
    });
    res.status(201).json({ data: media });
  },

  // DELETE /api/v1/media/:id
  // Returns the object key so the client can delete the stored file too. The
  // server holds no service-role key by design — it cannot reach into the
  // bucket, and the browser already has permission for its own folder.
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const storagePath = await mediaRepository.remove(id, req.user!.user_id);
    if (!storagePath) {
      throw HttpError.notFound(`Media ${id} not found`);
    }
    res.json({ data: { media_id: id, storage_path: storagePath } });
  },
};
