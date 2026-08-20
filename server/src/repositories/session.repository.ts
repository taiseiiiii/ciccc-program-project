import { pool, query } from "../db/pool";
import { buildUpdate } from "../utils/buildUpdate";
import type { Attempt } from "./attempt.repository";
import { attemptRepository } from "./attempt.repository";
import { routeRepository } from "./route.repository";
import { weaknessRepository } from "./weakness.repository";

/** Shape of a row in the `sessions` table. */
export interface Session {
  session_id: number;
  user_id: number;
  visit_date: string; // 'YYYY-MM-DD'
  gym_name: string | null;
  /** Time on the wall in minutes. NULL when the climber did not record it. */
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionInput {
  user_id: number;
  visit_date: string;
  gym_name?: string | null;
  duration_minutes?: number | null;
}

/**
 * One route nested in a bulk session create. The route row is created with it.
 *
 * Since migration 0007 this describes a whole route rather than a single try:
 * `attempt_count` tries of which `send_count` topped out. Wall and hold tags
 * belong to the route; weaknesses belong to the attempt (they are the
 * climber's read on that particular session, not a property of the problem).
 *
 * `weakness_labels` carries anything typed into the "other" box — each label
 * is resolved to a weakness_types row (reusing a preset or the climber's own
 * earlier label where one matches) inside the same transaction.
 */
export interface CreateSessionAttemptInput {
  grade_id: number;
  route_name?: string | null;
  attempt_count?: number;
  send_count?: number;
  note?: string | null;
  wall_type_ids?: number[];
  hold_type_ids?: number[];
  weakness_type_ids?: number[];
  weakness_labels?: string[];
}

export interface SessionWithAttempts extends Session {
  attempts: Attempt[];
}

export interface UpdateSessionInput {
  visit_date?: string;
  gym_name?: string | null;
  duration_minutes?: number | null;
}

/**
 * Data-access layer for sessions. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 *
 * All reads/writes are scoped to a user_id (taken from the verified token by
 * the controller) so one user can never see or touch another user's rows.
 */
export const sessionRepository = {
  /**
   * The climber's visits, newest first.
   *
   * `limit` is optional and defaults to everything, because the log screen and
   * the API's own contract still hand back the full list. The dashboard asks
   * for five — it only ever shows five.
   */
  async findAll(userId: number, limit?: number): Promise<Session[]> {
    const values: unknown[] = [userId];
    let suffix = "";
    if (limit !== undefined) {
      values.push(limit);
      suffix = ` LIMIT $${values.length}`;
    }
    const { rows } = await query<Session>(
      `SELECT * FROM sessions
       WHERE user_id = $1
       ORDER BY visit_date DESC, session_id DESC${suffix}`,
      values,
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<Session | null> {
    const { rows } = await query<Session>(
      `SELECT * FROM sessions WHERE session_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  /**
   * Create a session together with its routes, attempts and every tag in one
   * database transaction: either everything is persisted or nothing is. This
   * is what the log-session form uses — creating the pieces via separate
   * requests would leave a half-saved session behind whenever a later request
   * failed, and retrying would then duplicate it.
   *
   * The tag writes are part of the same transaction for the same reason: a
   * climb saved without the wall angle the climber selected is a silent data
   * loss, not a partial success.
   */
  async createWithAttempts(
    input: CreateSessionInput,
    attempts: CreateSessionAttemptInput[],
  ): Promise<SessionWithAttempts> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: sessionRows } = await client.query<Session>(
        `INSERT INTO sessions (user_id, visit_date, gym_name, duration_minutes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          input.user_id,
          input.visit_date,
          input.gym_name ?? null,
          input.duration_minutes ?? null,
        ],
      );
      const session = sessionRows[0]!;

      const createdAttempts: Attempt[] = [];
      for (const attempt of attempts) {
        const { rows: routeRows } = await client.query<{ route_id: number }>(
          `INSERT INTO routes (grade_id, route_name)
           VALUES ($1, $2)
           RETURNING route_id`,
          [attempt.grade_id, attempt.route_name ?? null],
        );
        const routeId = routeRows[0]!.route_id;

        const { rows: attemptRows } = await client.query<Attempt>(
          `INSERT INTO attempts (session_id, route_id, attempt_count, send_count, note)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            session.session_id,
            routeId,
            attempt.attempt_count ?? 1,
            attempt.send_count ?? 0,
            attempt.note ?? null,
          ],
        );
        const created = attemptRows[0]!;

        await attemptRepository.setRouteTags(
          routeId,
          {
            wallTypeIds: attempt.wall_type_ids ?? [],
            holdTypeIds: attempt.hold_type_ids ?? [],
          },
          client,
        );

        // Typed-in weaknesses become rows the climber owns, so the same word
        // is a dropdown option next time instead of a new near-duplicate.
        const weaknessIds = [...(attempt.weakness_type_ids ?? [])];
        for (const label of attempt.weakness_labels ?? []) {
          if (label.trim() === "") continue;
          const row = await weaknessRepository.findOrCreateByLabel(
            input.user_id,
            label,
            client,
          );
          weaknessIds.push(row.weakness_type_id);
        }
        await weaknessRepository.setForAttempt(
          created.attempt_id,
          [...new Set(weaknessIds)],
          client,
        );

        createdAttempts.push(created);
      }

      await client.query("COMMIT");
      return { ...session, attempts: createdAttempts };
    } catch (err) {
      // Swallow rollback failures (e.g. the connection died) so the original
      // error is the one that surfaces.
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Partial update. Only the fields provided are written, so a missing field is
   * left untouched rather than overwritten with NULL. See utils/buildUpdate.
   */
  async update(
    id: number,
    userId: number,
    input: UpdateSessionInput,
  ): Promise<Session | null> {
    const statement = buildUpdate(
      "sessions",
      {
        visit_date: input.visit_date,
        gym_name: input.gym_name,
        duration_minutes: input.duration_minutes,
      },
      { session_id: id, user_id: userId },
      { returning: "*" },
    );
    if (!statement) return this.findById(id, userId);

    const { rows } = await query<Session>(statement.text, statement.values);
    return rows[0] ?? null;
  },

  /**
   * Delete a visit, its climbs, and any route those climbs were the last
   * reference to.
   *
   * Attempts cascade from the session, but `routes` is the *parent* side of
   * that foreign key, so the route rows survive their own climbs and become
   * unreachable garbage. The ids are collected before the delete and swept
   * after it, all inside one transaction so a failure halfway leaves the visit
   * intact rather than half-deleted.
   */
  async remove(id: number, userId: number): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: routeRows } = await client.query<{ route_id: number }>(
        `SELECT a.route_id
           FROM attempts a
           JOIN sessions s USING (session_id)
          WHERE a.session_id = $1 AND s.user_id = $2`,
        [id, userId],
      );

      const { rowCount } = await client.query(
        `DELETE FROM sessions WHERE session_id = $1 AND user_id = $2`,
        [id, userId],
      );
      if ((rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      await routeRepository.removeOrphans(
        routeRows.map((r) => r.route_id),
        client,
      );

      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
};
