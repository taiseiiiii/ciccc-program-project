/**
 * A photo or video attached to a session or a logged climb.
 *
 * The row is metadata only — `storage_path` is the object key in the
 * `climb-media` Supabase Storage bucket. The bucket is private, so displaying
 * one means asking Storage for a short-lived signed URL (see lib/storage.ts).
 */
export default interface Media {
  media_id: number;
  user_id: number;
  session_id: number | null;
  attempt_id: number | null;
  storage_path: string;
  kind: "photo" | "video";
  mime_type: string;
  byte_size: number;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

/** What GET /media/usage returns — the numbers the upload UI warns against. */
export interface MediaUsage {
  used_bytes: number;
  limit_bytes: number;
  max_photo_bytes: number;
  max_video_bytes: number;
  max_video_seconds: number;
}
