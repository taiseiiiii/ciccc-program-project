import { query } from "../db/pool";

/**
 * Data-access layer for injuries and their daily check-ins.
 *
 * Scope reminder that shapes what is (and is not) here: the app records
 * injuries and manages load. There is no diagnosis and no treatment plan, so
 * there is nothing here that reads or writes one. What these rows drive is
 * (a) the pain trend the climber sees, and (b) the list of body parts the AI
 * training plan has to route around.
 *
 * Same ownership rule as everywhere else: injuries are scoped by user_id, and
 * logs reach ownership through their parent injury.
 */

export interface Injury {
  injury_id: number;
  user_id: number;
  body_part_id: number;
  side: "left" | "right" | "both" | null;
  occurred_on: string; // 'YYYY-MM-DD'
  status: "active" | "recovering" | "healed";
  severity: number | null;
  description: string | null;
  resolved_on: string | null;
  created_at: string;
  updated_at: string;
}

/** An injury as the API returns it: the row plus the body part label. */
export interface InjuryWithPart extends Injury {
  body_part_code: string;
  body_part_label: string;
  /** Most recent check-in, so the list can show today's pain without N+1. */
  latest_pain_level: number | null;
  latest_logged_on: string | null;
}

export interface InjuryLog {
  injury_log_id: number;
  injury_id: number;
  logged_on: string;
  pain_level: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateInjuryInput {
  user_id: number;
  body_part_id: number;
  side?: "left" | "right" | "both" | null;
  occurred_on: string;
  severity?: number | null;
  description?: string | null;
}

export interface UpdateInjuryInput {
  body_part_id?: number;
  side?: "left" | "right" | "both" | null;
  occurred_on?: string;
  status?: "active" | "recovering" | "healed";
  severity?: number | null;
  description?: string | null;
  resolved_on?: string | null;
}

// The joined shape every read returns. LEFT JOIN LATERAL rather than a
// correlated subquery per column so the latest check-in is fetched once.
const SELECT_WITH_PART = `
  SELECT i.*,
         bp.code  AS body_part_code,
         bp.label AS body_part_label,
         latest.pain_level AS latest_pain_level,
         latest.logged_on  AS latest_logged_on
    FROM injuries i
    JOIN body_parts bp USING (body_part_id)
    LEFT JOIN LATERAL (
      SELECT l.pain_level, l.logged_on
        FROM injury_logs l
       WHERE l.injury_id = i.injury_id
       ORDER BY l.logged_on DESC
       LIMIT 1
    ) latest ON true`;

export const injuryRepository = {
  /** Open injuries first, then healed ones, most recent first within each. */
  async findAll(
    userId: number,
    options: { status?: Injury["status"] } = {},
  ): Promise<InjuryWithPart[]> {
    const values: unknown[] = [userId];
    let where = `WHERE i.user_id = $1`;
    if (options.status) {
      values.push(options.status);
      where += ` AND i.status = $${values.length}`;
    }
    const { rows } = await query<InjuryWithPart>(
      `${SELECT_WITH_PART}
       ${where}
       ORDER BY (i.status = 'healed'), i.occurred_on DESC, i.injury_id DESC`,
      values,
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<InjuryWithPart | null> {
    const { rows } = await query<InjuryWithPart>(
      `${SELECT_WITH_PART} WHERE i.injury_id = $1 AND i.user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  /**
   * Body parts the climber currently cannot load. This is what gets handed to
   * the AI coach and checked against its output — 'recovering' counts, because
   * a part that is only just taking load again should not be the target of a
   * new training block.
   */
  async findActiveBodyParts(userId: number): Promise<
    Array<{ code: string; label: string; status: string; severity: number | null }>
  > {
    const { rows } = await query<{
      code: string;
      label: string;
      status: string;
      severity: number | null;
    }>(
      `SELECT bp.code, bp.label, i.status, i.severity
         FROM injuries i
         JOIN body_parts bp USING (body_part_id)
        WHERE i.user_id = $1 AND i.status <> 'healed'
        ORDER BY i.severity DESC NULLS LAST, bp.sort_order`,
      [userId],
    );
    return rows;
  },

  async create(input: CreateInjuryInput): Promise<InjuryWithPart> {
    const { rows } = await query<{ injury_id: number }>(
      `INSERT INTO injuries
         (user_id, body_part_id, side, occurred_on, severity, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING injury_id`,
      [
        input.user_id,
        input.body_part_id,
        input.side ?? null,
        input.occurred_on,
        input.severity ?? null,
        input.description ?? null,
      ],
    );
    // Re-read so the caller gets the joined shape the list endpoints return.
    return (await this.findById(rows[0]!.injury_id, input.user_id))!;
  },

  /**
   * Partial update. Marking an injury healed without naming a date fills in
   * today, and reopening one clears the date — the CHECK constraint requires
   * resolved_on and status='healed' to agree, and the caller should not have
   * to remember that.
   */
  async update(
    id: number,
    userId: number,
    input: UpdateInjuryInput,
  ): Promise<InjuryWithPart | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    const push = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (input.body_part_id !== undefined) push("body_part_id", input.body_part_id);
    if (input.side !== undefined) push("side", input.side);
    if (input.occurred_on !== undefined) push("occurred_on", input.occurred_on);
    if (input.severity !== undefined) push("severity", input.severity);
    if (input.description !== undefined) push("description", input.description);

    if (input.status !== undefined) {
      push("status", input.status);
      if (input.resolved_on !== undefined) {
        push("resolved_on", input.resolved_on);
      } else if (input.status === "healed") {
        fields.push(`resolved_on = COALESCE(resolved_on, CURRENT_DATE)`);
      } else {
        fields.push(`resolved_on = NULL`);
      }
    } else if (input.resolved_on !== undefined) {
      push("resolved_on", input.resolved_on);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id);
    const idIdx = values.length;
    values.push(userId);
    const userIdx = values.length;

    const { rowCount } = await query(
      `UPDATE injuries SET ${fields.join(", ")}
       WHERE injury_id = $${idIdx} AND user_id = $${userIdx}`,
      values,
    );
    if ((rowCount ?? 0) === 0) return null;
    return this.findById(id, userId);
  },

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM injuries WHERE injury_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },

  /* ---------------------------- daily check-ins --------------------------- */

  /** Check-ins for one injury, oldest first so the chart can plot them as-is. */
  async findLogs(injuryId: number, userId: number): Promise<InjuryLog[]> {
    const { rows } = await query<InjuryLog>(
      `SELECT l.* FROM injury_logs l
         JOIN injuries i USING (injury_id)
        WHERE l.injury_id = $1 AND i.user_id = $2
        ORDER BY l.logged_on ASC`,
      [injuryId, userId],
    );
    return rows;
  },

  /**
   * Record today's pain level. One entry per injury per day, so re-submitting
   * corrects the day rather than adding a second reading — hence upsert, not
   * insert.
   */
  async upsertLog(
    injuryId: number,
    userId: number,
    input: { logged_on: string; pain_level: number; note?: string | null },
  ): Promise<InjuryLog | null> {
    const { rows } = await query<InjuryLog>(
      `INSERT INTO injury_logs (injury_id, logged_on, pain_level, note)
       SELECT $1, $2, $3, $4
         FROM injuries
        WHERE injury_id = $1 AND user_id = $5
       ON CONFLICT (injury_id, logged_on) DO UPDATE
         SET pain_level = EXCLUDED.pain_level,
             note       = EXCLUDED.note
       RETURNING *`,
      [injuryId, input.logged_on, input.pain_level, input.note ?? null, userId],
    );
    // No row means the SELECT matched nothing: the injury is missing or is
    // someone else's, which the controller turns into a 404.
    return rows[0] ?? null;
  },
};
