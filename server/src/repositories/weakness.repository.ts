import { pool, query } from "../db/pool";
import type { PoolClient } from "pg";

/**
 * Data-access layer for self-reported weaknesses.
 *
 * One table holds two kinds of row: shared presets (`user_id IS NULL`, created
 * by migration 0006) and labels a climber typed in themselves. A climber sees
 * both, and can only ever create or delete their own.
 *
 * That is what makes "a dropdown you can also type into" produce data worth
 * aggregating: the typed word becomes a row, so the second time it is a
 * dropdown option rather than a near-duplicate string.
 */

export interface WeaknessType {
  weakness_type_id: number;
  /** NULL for a shared preset, otherwise the owning climber. */
  user_id: number | null;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Labels are compared case-insensitively and trimmed, so "Footwork" and
 *  "  footwork " resolve to the same row instead of piling up duplicates. */
function normalise(label: string): string {
  return label.trim();
}

export const weaknessRepository = {
  /** The presets plus this climber's own labels, presets first. */
  async findAllForUser(userId: number): Promise<WeaknessType[]> {
    const { rows } = await query<WeaknessType>(
      `SELECT * FROM weakness_types
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY sort_order ASC, label ASC`,
      [userId],
    );
    return rows;
  },

  /**
   * Resolve a typed label to a weakness id, creating the climber's own row the
   * first time they use it.
   *
   * Matching is case-insensitive and checks the presets first, so typing
   * "footwork" reuses the shared "Footwork" instead of creating a private
   * near-duplicate. The insert uses ON CONFLICT against the partial unique
   * index so two rapid submissions cannot race into two rows.
   *
   * Takes an optional client so a bulk session save can run it inside the same
   * transaction as the session and its attempts.
   */
  async findOrCreateByLabel(
    userId: number,
    rawLabel: string,
    client?: PoolClient,
  ): Promise<WeaknessType> {
    const label = normalise(rawLabel);
    // Pool and PoolClient share the same query signature, so the transactional
    // and standalone paths differ only in which one runs the statements.
    const exec = client ?? pool;

    const existing = await exec.query<WeaknessType>(
      `SELECT * FROM weakness_types
       WHERE lower(label) = lower($1) AND (user_id IS NULL OR user_id = $2)
       ORDER BY user_id NULLS FIRST
       LIMIT 1`,
      [label, userId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const inserted = await exec.query<WeaknessType>(
      `INSERT INTO weakness_types (user_id, label)
       VALUES ($1, $2)
       ON CONFLICT (user_id, label) WHERE user_id IS NOT NULL DO UPDATE
         SET updated_at = now()
       RETURNING *`,
      [userId, label],
    );
    return inserted.rows[0]!;
  },

  /**
   * Replace the weaknesses attached to one attempt. Delete-then-insert rather
   * than a diff: the sets are tiny, and it makes "unchecked everything" work
   * without a special case.
   */
  async setForAttempt(
    attemptId: number,
    weaknessTypeIds: number[],
    client?: PoolClient,
  ): Promise<void> {
    const exec = client ?? pool;
    await exec.query(`DELETE FROM attempt_weaknesses WHERE attempt_id = $1`, [
      attemptId,
    ]);
    if (weaknessTypeIds.length === 0) return;
    await exec.query(
      `INSERT INTO attempt_weaknesses (attempt_id, weakness_type_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT DO NOTHING`,
      [attemptId, weaknessTypeIds],
    );
  },

  /** Delete one of the climber's own labels. Presets can never be removed. */
  async removeCustom(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM weakness_types WHERE weakness_type_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
