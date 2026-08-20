import { api } from "./api";
import type Media from "../types/MediaType";

/**
 * Photo/video attachments.
 *
 * The file never goes through our Express server. The browser asks the API to
 * describe where the file should go, PUTs the bytes straight to object storage
 * using the URL it gets back, and only then posts the metadata. That keeps a
 * 40 MB video off a serverless request, and means a failed upload leaves
 * nothing behind — the row is written once the bytes are already there.
 *
 * The bucket is private and the browser has no standing credentials for it, so
 * every upload URL and every display URL is signed by the server for one file
 * at a time. The server also picks the object key: it used to be built here,
 * which made "is this key yours" a question the API had to take on trust.
 */

/** Photos are resized before upload — a modern phone photo is 3–6 MB of detail
 *  nobody needs to remember a boulder problem by. */
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.8;

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

export interface UploadTarget {
  sessionId?: number;
  attemptId?: number;
}

/**
 * Upload one file and attach it. Returns the created metadata row.
 *
 * Three steps, in this order: ask for a URL, send the bytes, record the row.
 *
 * The first step is where every rule is enforced — the file's type and size,
 * the quota, and whether the session it is being pinned to is really the
 * climber's — so an upload that would be rejected never spends the climber's
 * bandwidth. The size is signed into the URL, which is why `byte_size` here has
 * to be the size of exactly what gets sent: `prepared`, after compression, not
 * the original file.
 *
 * Nothing needs cleaning up on failure. A URL that goes unused expires, and a
 * file with no row is invisible to the app — the previous version had to delete
 * the object by hand if the metadata request failed.
 */
export async function uploadMedia(
  file: File,
  target: UploadTarget,
): Promise<Media> {
  const isVideo = file.type.startsWith("video/");
  const prepared = isVideo ? file : await compressImage(file);
  const duration = isVideo ? await readVideoDuration(file) : undefined;

  if (isVideo && !duration) {
    throw new Error("Could not read that video — try exporting it as MP4");
  }

  const describe = {
    kind: isVideo ? "video" : "photo",
    mime_type: prepared.type,
    byte_size: prepared.size,
    duration_seconds: duration,
    session_id: target.sessionId,
    attempt_id: target.attemptId,
  };

  const { data: presigned } = await api<{
    data: { storage_path: string; upload_url: string };
  }>("/media/presign", {
    method: "POST",
    body: JSON.stringify(describe),
  });

  const res = await fetch(presigned.upload_url, {
    method: "PUT",
    // Both headers are part of what the server signed. A mismatch is refused by
    // storage, which is what makes the declared size trustworthy.
    headers: {
      "Content-Type": prepared.type,
      "Content-Length": String(prepared.size),
    },
    body: prepared,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }

  const { data } = await api<{ data: Media }>("/media", {
    method: "POST",
    body: JSON.stringify({ ...describe, storage_path: presigned.storage_path }),
  });
  return data;
}

/** Delete an attachment. The server removes the stored file along with the row. */
export async function deleteMedia(mediaId: number): Promise<void> {
  await api(`/media/${mediaId}`, { method: "DELETE" });
}

/**
 * Signed display URLs for a batch of attachments, keyed by storage path.
 *
 * Signed in one call rather than per thumbnail: a session with a dozen photos
 * would otherwise fire a dozen round-trips just to render a strip of images.
 *
 * A key the server will not sign — a row whose object has gone missing — is
 * simply absent from the result, and MediaGallery renders nothing for it rather
 * than a broken image.
 */
export async function signMediaUrls(
  media: Media[],
): Promise<Record<string, string>> {
  if (media.length === 0) return {};

  try {
    const { data } = await api<{ data: { urls: Record<string, string> } }>(
      "/media/urls",
      {
        method: "POST",
        body: JSON.stringify({
          storage_paths: media.map((m) => m.storage_path),
        }),
      },
    );
    return data.urls;
  } catch {
    // A thumbnail strip that cannot be signed should leave the rest of the
    // session readable, the same way the old Storage call swallowed its error.
    return {};
  }
}
