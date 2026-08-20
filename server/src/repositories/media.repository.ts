import { query } from "../db/pool";

/**
 * Data-access layer for photo/video attachments.
 *
 * Only metadata is stored. The file itself is uploaded by the browser straight
 * to Supabase Storage with the climber's own access token, and this server
 * never sees a byte of it — the client uploads first, then posts the resulting
 * object key here. A failed upload therefore leaves no row, and a row that
 * exists always points at an object that was successfully written.
 *
 * Same ownership rule as everywhere else: every read/write is scoped to the
 * user_id taken from the verified token, and all values are parameterized.
 */

export interface Media {
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

export interface CreateMediaInput {
  user_id: number;
  session_id?: number | null;
  attempt_id?: number | null;
  storage_path: string;
  kind: "photo" | "video";
  mime_type: string;
  byte_size: number;
  duration_seconds?: number | null;
}

export const mediaRepository = {
  /**
   * The climber's attachments, newest first, optionally scoped to one parent.
   *
   * `sessionId` means "everything from that visit" — rows pinned to the session
   * itself *and* rows pinned to any climb within it. Matching only
   * `media.session_id` would return almost nothing in practice, because the log
   * form attaches photos to the climb they belong to, not to the visit; a
   * session view built on that saw an empty gallery.
   */
  async findAll(
    userId: number,
    scope: { sessionId?: number; attemptId?: number } = {},
  ): Promise<Media[]> {
    const values: unknown[] = [userId];
    let where = `WHERE m.user_id = $1`;
    if (scope.sessionId !== undefined) {
      values.push(scope.sessionId);
      const idx = values.length;
      where += ` AND (m.session_id = $${idx} OR a.session_id = $${idx})`;
    }
    if (scope.attemptId !== undefined) {
      values.push(scope.attemptId);
      where += ` AND m.attempt_id = $${values.length}`;
    }
    const { rows } = await query<Media>(
      `SELECT m.* FROM media m
         LEFT JOIN attempts a ON a.attempt_id = m.attempt_id
       ${where}
       ORDER BY m.created_at DESC, m.media_id DESC`,
      values,
    );
    return rows;
  },

  /**
   * Record an uploaded object. storage_path is UNIQUE, so a retried POST after
   * a dropped response returns the existing row instead of double-attaching
   * the same file.
   */
  async create(input: CreateMediaInput): Promise<Media> {
    const { rows } = await query<Media>(
      `INSERT INTO media
         (user_id, session_id, attempt_id, storage_path,
          kind, mime_type, byte_size, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (storage_path) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [
        input.user_id,
        input.session_id ?? null,
        input.attempt_id ?? null,
        input.storage_path,
        input.kind,
        input.mime_type,
        input.byte_size,
        input.duration_seconds ?? null,
      ],
    );
    return rows[0]!;
  },

  /**
   * Delete the row and hand back the object key, so the controller can remove
   * the stored file too. Returns null when nothing was deleted.
   */
  async remove(id: number, userId: number): Promise<string | null> {
    const { rows } = await query<{ storage_path: string }>(
      `DELETE FROM media WHERE media_id = $1 AND user_id = $2
       RETURNING storage_path`,
      [id, userId],
    );
    return rows[0]?.storage_path ?? null;
  },

  /**
   * Total bytes this climber is storing. The bucket is on a shared free-tier
   * quota, so uploads are refused past a per-user ceiling rather than letting
   * one account exhaust it for everyone.
   */
  async totalBytes(userId: number): Promise<number> {
    const { rows } = await query<{ total: string | null }>(
      `SELECT SUM(byte_size)::text AS total FROM media WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0]?.total ?? 0);
  },
};
