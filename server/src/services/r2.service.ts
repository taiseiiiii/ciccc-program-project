import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";
import { HttpError } from "../utils/HttpError";

/**
 * Object storage for photos and videos, on Cloudflare R2.
 *
 * The browser still uploads directly — a 40 MB video has no business travelling
 * through a serverless function — but it can no longer authenticate itself to
 * the bucket. Supabase Storage let it, because the climber's own token carried
 * the permission; R2 has no notion of our users. So the server signs a URL that
 * grants exactly one upload, and hands that to the browser instead.
 *
 * That indirection turned out to be worth more than the platform change:
 *
 *   * The size a client declares is now signed into the URL. It used to be a
 *     number the client made up and the server took on trust, checked against
 *     the quota and then never verified.
 *
 *   * The key is chosen here rather than by the client, so "does this path
 *     belong to you" stops being a question anyone has to validate.
 *
 *   * The server can delete. Supabase Storage was unreachable from here without
 *     a service-role key, which is why deleting a session used to leave its
 *     files behind in the bucket forever.
 *
 * R2 speaks the S3 API, hence the AWS SDK. `region: "auto"` is R2's own
 * convention — it has no regions to name.
 */

/** How long an upload URL stays usable. One upload, started promptly. */
const UPLOAD_TTL_SECONDS = 600;

/** How long a display URL stays valid. Long enough to browse a session, short
 *  enough that a copied link is not a permanent public one. */
const DOWNLOAD_TTL_SECONDS = 60 * 60;

/** R2 caps a single DeleteObjects call at 1000 keys. */
const DELETE_BATCH = 1000;

let client: S3Client | null = null;

/** True when the server has been given R2 credentials. */
export function isStorageConfigured(): boolean {
  return Boolean(
    env.r2AccountId &&
      env.r2AccessKeyId &&
      env.r2SecretAccessKey &&
      env.r2Bucket,
  );
}

/**
 * The shared S3 client, built on first use.
 *
 * Lazy so that a server without R2 credentials still boots and serves every
 * other endpoint — the media routes answer 503 and nothing else notices.
 */
function s3(): S3Client {
  if (!isStorageConfigured()) {
    throw HttpError.serviceUnavailable(
      "File storage is not configured on this server",
    );
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId!,
      secretAccessKey: env.r2SecretAccessKey!,
    },
  });
  return client;
}

function bucket(): string {
  return env.r2Bucket!;
}

/**
 * A URL the browser can PUT one file to.
 *
 * `ContentLength` and `ContentType` are part of what gets signed, so the upload
 * is refused unless it matches the size and type the quota was checked against.
 * A client that under-declares to slip past the ceiling finds the URL will not
 * accept the bytes it actually has.
 */
export function presignPut(params: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    }),
    { expiresIn: UPLOAD_TTL_SECONDS },
  );
}

/**
 * Display URLs for a batch of objects, keyed by their storage path.
 *
 * Signed together rather than per thumbnail: a session with a dozen photos
 * would otherwise cost a dozen round trips just to render a strip of images.
 * Signing is a local HMAC — no network call per key — so the batch is cheap.
 */
export async function presignGetMany(
  keys: string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  const urls: Record<string, string> = {};
  await Promise.all(
    keys.map(async (key) => {
      urls[key] = await getSignedUrl(
        s3(),
        new GetObjectCommand({ Bucket: bucket(), Key: key }),
        { expiresIn: DOWNLOAD_TTL_SECONDS },
      );
    }),
  );
  return urls;
}

/**
 * The stored size of an object, or null if it is not there.
 *
 * Called before writing the metadata row, so a row can never claim bytes that
 * were never uploaded.
 */
export async function headObject(key: string): Promise<number | null> {
  try {
    const res = await s3().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key }),
    );
    return res.ContentLength ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove objects, best effort.
 *
 * Deliberately never throws. Every caller has already deleted the rows that
 * pointed at these files, and that is the half the climber can see — failing
 * the request afterwards would report a delete that did happen as an error, and
 * leave them pressing a button that cannot succeed. A file that outlives its
 * row costs quota and is caught by reconciling the bucket against the table.
 */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0 || !isStorageConfigured()) return;

  try {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH);
      await s3().send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }),
      );
    }
  } catch (err) {
    console.error("[storage] failed to delete objects", keys, err);
  }
}
