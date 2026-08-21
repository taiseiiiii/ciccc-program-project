import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { mediaRepository } from "../repositories/media.repository";
import { sessionRepository } from "../repositories/session.repository";
import { attemptRepository } from "../repositories/attempt.repository";
import { HttpError } from "../utils/HttpError";
import { optionalInt, parseId, requireInt } from "../utils/validate";
import {
  deleteObjects,
  headObject,
  presignGetMany,
  presignPut,
} from "../services/r2.service";

/**
 * HTTP layer for photo/video attachments.
 *
 * This endpoint never receives a file. Uploading is two requests: the client
 * describes what it is about to send, the server validates that and answers
 * with a URL good for exactly that one upload, and the browser PUTs the bytes
 * straight to storage. A 40 MB video never has to fit through a request here.
 *
 * The important consequence is that the checks below now bind. The size the
 * client declares is signed into the upload URL, so an upload that does not
 * match the size the quota was checked against is refused by storage itself —
 * this used to be a self-reported number taken on trust. The object key is
 * chosen here too, so "is this key yours" is no longer a question anyone has to
 * answer.
 */

// Per-file ceilings. Photos are resized client-side before upload, so anything
// this large means the resize was skipped.
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_VIDEO_SECONDS = 120;

// Per-account ceiling. R2's free tier is 10 GB and bills fractions of a cent
// per gigabyte after that, so this is about one climber not filling the bucket
// with everything their phone has ever recorded, not about a hard cliff.
const MAX_ACCOUNT_BYTES = 200 * 1024 * 1024; // 200 MB

// A batch of display URLs is one screen's worth of thumbnails, not a backup.
const MAX_URL_BATCH = 100;

const ALLOWED_MIME: Record<"photo" | "video", string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

interface UploadRequest {
  kind: "photo" | "video";
  mimeType: string;
  byteSize: number;
  duration: number | null;
  sessionId?: number;
  attemptId?: number;
}

/**
 * Everything both halves of an upload have to agree on.
 *
 * Run when the URL is issued and again when the row is written: the second call
 * is not redundant, because the two requests are minutes apart and the quota
 * can have been spent by another upload in between.
 */
function parseUpload(body: Record<string, unknown>): UploadRequest {
  const { kind, mime_type, byte_size, duration_seconds, session_id, attempt_id } =
    body;

  if (kind !== "photo" && kind !== "video") {
    throw HttpError.badRequest("kind is required and must be 'photo' or 'video'");
  }
  const mediaKind: "photo" | "video" = kind;

  if (typeof mime_type !== "string" || !ALLOWED_MIME[mediaKind].includes(mime_type)) {
    throw HttpError.badRequest(
      `mime_type must be one of: ${ALLOWED_MIME[mediaKind].join(", ")}`,
    );
  }
  if (typeof byte_size !== "number" || !Number.isInteger(byte_size) || byte_size <= 0) {
    throw HttpError.badRequest("byte_size is required and must be a positive integer");
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

  // An attachment has to belong to something, and that something has to be the
  // caller's — otherwise a photo could be pinned to a stranger's session.
  const sessionId =
    session_id === undefined || session_id === null
      ? undefined
      : requireInt(session_id, "session_id");
  const attemptId =
    attempt_id === undefined || attempt_id === null
      ? undefined
      : requireInt(attempt_id, "attempt_id");

  if (sessionId === undefined && attemptId === undefined) {
    throw HttpError.badRequest("Attach the file to a session_id or an attempt_id");
  }

  return {
    kind: mediaKind,
    mimeType: mime_type,
    byteSize: byte_size,
    duration: duration ?? null,
    sessionId,
    attemptId,
  };
}

/** 404s unless the session/attempt the file is being pinned to is the caller's. */
async function assertParentOwned(
  upload: UploadRequest,
  userId: number,
): Promise<void> {
  if (upload.sessionId !== undefined) {
    const session = await sessionRepository.findById(upload.sessionId, userId);
    if (!session) throw HttpError.notFound(`Session ${upload.sessionId} not found`);
  }
  if (upload.attemptId !== undefined) {
    const attempt = await attemptRepository.findById(upload.attemptId, userId);
    if (!attempt) throw HttpError.notFound(`Attempt ${upload.attemptId} not found`);
  }
}

async function assertWithinQuota(userId: number, incoming: number): Promise<void> {
  const used = await mediaRepository.totalBytes(userId);
  if (used + incoming > MAX_ACCOUNT_BYTES) {
    throw HttpError.unprocessable(
      `Storage limit reached (${Math.round(MAX_ACCOUNT_BYTES / 1024 / 1024)} MB). Delete some photos or videos first.`,
    );
  }
}

/** `<auth_user_id>/<yyyy>/<mm>/<uuid>.<ext>` — unchanged from when the browser
 *  built it, so keys copied over from the old bucket still resolve. */
function buildStorageKey(authUserId: string, mimeType: string): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = EXTENSIONS[mimeType] ?? "bin";
  return `${authUserId}/${now.getFullYear()}/${month}/${randomUUID()}.${ext}`;
}

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

  // POST /api/v1/media/presign
  // Body: { kind, mime_type, byte_size, duration_seconds?, session_id?, attempt_id? }
  //
  // Answers with the key the file will live under and a URL to PUT it to. No
  // row is written here: an upload that never happens should leave nothing
  // behind, so the metadata is posted separately once the bytes are there.
  async presign(req: Request, res: Response): Promise<void> {
    const upload = parseUpload((req.body ?? {}) as Record<string, unknown>);
    await assertParentOwned(upload, req.user!.user_id);
    await assertWithinQuota(req.user!.user_id, upload.byteSize);

    const key = buildStorageKey(req.user!.auth_user_id, upload.mimeType);
    const uploadUrl = await presignPut({
      key,
      contentType: upload.mimeType,
      contentLength: upload.byteSize,
    });

    res.json({ data: { storage_path: key, upload_url: uploadUrl } });
  },

  // POST /api/v1/media
  // Body: { storage_path, kind, mime_type, byte_size, session_id?, attempt_id?, duration_seconds? }
  async create(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { storage_path } = body;

    if (typeof storage_path !== "string" || storage_path.trim() === "") {
      throw HttpError.badRequest("storage_path is required");
    }

    // Keys are issued under the caller's own folder, so one outside that prefix
    // was not issued to them — whatever else it is, it is not theirs to claim.
    const prefix = `${req.user!.auth_user_id}/`;
    if (!storage_path.startsWith(prefix)) {
      throw HttpError.badRequest("storage_path must start with your own user folder");
    }

    const upload = parseUpload(body);
    await assertParentOwned(upload, req.user!.user_id);

    // Ask storage what is actually there. Without this the table can describe
    // files that were never uploaded, and the quota is computed from the table.
    const storedBytes = await headObject(storage_path);
    if (storedBytes === null) {
      throw HttpError.badRequest(
        "No uploaded file found at that storage_path — upload it before saving",
      );
    }
    if (storedBytes !== upload.byteSize) {
      throw HttpError.badRequest(
        `byte_size does not match the uploaded file (${storedBytes} bytes)`,
      );
    }

    // Checked again rather than trusted from the presign step: minutes may have
    // passed, and another upload may have spent the room in between.
    await assertWithinQuota(req.user!.user_id, upload.byteSize);

    const media = await mediaRepository.create({
      user_id: req.user!.user_id,
      session_id: upload.sessionId ?? null,
      attempt_id: upload.attemptId ?? null,
      storage_path,
      kind: upload.kind,
      mime_type: upload.mimeType,
      byte_size: upload.byteSize,
      duration_seconds: upload.duration,
    });
    res.status(201).json({ data: media });
  },

  // POST /api/v1/media/urls
  // Body: { storage_paths: string[] }  ->  { data: { urls: { path: url } } }
  //
  // A POST rather than a GET because a session's worth of keys does not belong
  // in a query string. Nothing is created; this reads.
  async signUrls(req: Request, res: Response): Promise<void> {
    const { storage_paths } = (req.body ?? {}) as Record<string, unknown>;

    if (!Array.isArray(storage_paths)) {
      throw HttpError.badRequest("storage_paths must be an array");
    }
    if (storage_paths.length > MAX_URL_BATCH) {
      throw HttpError.badRequest(
        `storage_paths cannot hold more than ${MAX_URL_BATCH} entries`,
      );
    }
    if (storage_paths.some((p) => typeof p !== "string")) {
      throw HttpError.badRequest("storage_paths must be an array of strings");
    }

    // Signed only for paths the caller actually owns a row for. Skipping this
    // would turn the endpoint into "sign any key you can guess", and the keys
    // are the one part of the scheme a client has seen before.
    const owned = await mediaRepository.findOwnedPaths(
      req.user!.user_id,
      storage_paths as string[],
    );
    res.json({ data: { urls: await presignGetMany(owned) } });
  },

  // DELETE /api/v1/media/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const storagePath = await mediaRepository.remove(id, req.user!.user_id);
    if (!storagePath) {
      throw HttpError.notFound(`Media ${id} not found`);
    }
    // The row is gone either way; a file left behind is a quota leak, not a
    // failed delete. See deleteObjects.
    await deleteObjects([storagePath]);
    res.json({ data: { media_id: id, storage_path: storagePath } });
  },
};
