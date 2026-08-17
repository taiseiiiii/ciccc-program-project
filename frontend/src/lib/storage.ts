import { supabase } from "./supabase";
import { api } from "./api";
import type Media from "../types/MediaType";

/**
 * Photo/video attachments.
 *
 * The file never goes through our Express server. The browser uploads it
 * straight to Supabase Storage using the climber's own access token, and only
 * the resulting object key is posted to the API. That keeps a 40 MB video off
 * a free-tier request, and means a failed upload leaves nothing behind to
 * clean up — the metadata row is only written once the bytes are safely there.
 *
 * The bucket is private. Its RLS policy allows a climber to read and write
 * only under their own `<auth_user_id>/` prefix, which is why every key starts
 * with it and why displaying a file means asking for a signed URL.
 */

export const MEDIA_BUCKET = "climb-media";

/** Photos are resized before upload — a modern phone photo is 3–6 MB of detail
 *  nobody needs to remember a boulder problem by. */
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.8;

/** How long a display URL stays valid. Long enough to browse, short enough
 *  that a copied link is not a permanent public one. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/**
 * Shrink a photo to something worth storing.
 *
 * Falls back to the original file if anything goes wrong: a slightly oversized
 * upload is a far better outcome than losing the climber's photo to a canvas
 * quirk on some browser. HEIC is passed through untouched — Safari can decode
 * it but canvas cannot re-encode it usefully.
 */
async function compressImage(file: File): Promise<File> {
  if (file.type === "image/heic") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    // Already small enough — re-encoding would only lose quality.
    if (scale === 1 && file.size < 1_000_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/** Read a video's length without uploading it, so the size/length limits can
 *  be enforced before spending the climber's bandwidth. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(video.duration) || 0);
    };
    // A codec the browser cannot parse should not block the upload — the
    // server treats a missing duration on a video as a validation error, so
    // 0 surfaces as a clear message rather than a silent hang.
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

/** `<auth_user_id>/<yyyy>/<mm>/<uuid>.<ext>` — the shape the bucket policy expects. */
function buildStoragePath(authUserId: string, mimeType: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = EXTENSIONS[mimeType] ?? "bin";
  return `${authUserId}/${year}/${month}/${crypto.randomUUID()}.${ext}`;
}

export interface UploadTarget {
  sessionId?: number;
  attemptId?: number;
}

/**
 * Upload one file and attach it. Returns the created metadata row.
 *
 * Ordering matters: the object goes up first, the row second. If the metadata
 * request fails the object is removed again, so the bucket never accumulates
 * files that nothing points at.
 */
export async function uploadMedia(
  file: File,
  target: UploadTarget,
): Promise<Media> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authUserId = sessionData.session?.user?.id;
  if (!authUserId) throw new Error("You need to be signed in to upload");

  const isVideo = file.type.startsWith("video/");
  const prepared = isVideo ? file : await compressImage(file);
  const duration = isVideo ? await readVideoDuration(file) : undefined;

  if (isVideo && !duration) {
    throw new Error("Could not read that video — try exporting it as MP4");
  }

  const storagePath = buildStoragePath(authUserId, prepared.type);

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, prepared, {
      contentType: prepared.type,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  try {
    const { data } = await api<{ data: Media }>("/media", {
      method: "POST",
      body: JSON.stringify({
        storage_path: storagePath,
        kind: isVideo ? "video" : "photo",
        mime_type: prepared.type,
        byte_size: prepared.size,
        duration_seconds: duration,
        session_id: target.sessionId,
        attempt_id: target.attemptId,
      }),
    });
    return data;
  } catch (err) {
    // The row was rejected (quota, bad parent, network) — take the orphaned
    // object back out rather than leaving it billing against the quota.
    await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
    throw err;
  }
}

/**
 * Delete an attachment: the row first, then the object.
 *
 * The server has no service-role key by design, so it cannot reach into the
 * bucket — it returns the key and the browser, which already has permission
 * for its own folder, does the second half.
 */
export async function deleteMedia(mediaId: number): Promise<void> {
  const { data } = await api<{ data: { storage_path: string } }>(
    `/media/${mediaId}`,
    { method: "DELETE" },
  );
  await supabase.storage.from(MEDIA_BUCKET).remove([data.storage_path]);
}

/**
 * Signed display URLs for a batch of attachments, keyed by storage path.
 *
 * Signed in one call rather than per thumbnail: a session with a dozen photos
 * would otherwise fire a dozen round-trips just to render a strip of images.
 */
export async function signMediaUrls(
  media: Media[],
): Promise<Record<string, string>> {
  if (media.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(
      media.map((m) => m.storage_path),
      SIGNED_URL_TTL_SECONDS,
    );
  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const entry of data) {
    // `path` is null for entries Storage could not sign (e.g. a row whose
    // object was deleted out from under it) — skip those rather than
    // rendering a broken image.
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}
