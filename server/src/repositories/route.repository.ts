import { query } from '../db/pool';

/** Shape of a row in the `routes` table (a climbing route / problem). */
export interface Route {
  route_id: number;
  grade_id: number;
  route_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRouteInput {
  grade_id: number;
  route_name?: string | null;
}

export interface UpdateRouteInput {
  grade_id?: number;
  route_name?: string | null;
}

/**
 * Data-access layer for routes. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 */
export const routeRepository = {
  async findAll(): Promise<Route[]> {
    const { rows } = await query<Route>(
      `SELECT * FROM routes ORDER BY route_id DESC`,
    );
    return rows;
  },

  async findById(id: number): Promise<Route | null> {
    const { rows } = await query<Route>(
      `SELECT * FROM routes WHERE route_id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateRouteInput): Promise<Route> {
    const { rows } = await query<Route>(
      `INSERT INTO routes (grade_id, route_name)
       VALUES ($1, $2)
       RETURNING *`,
      [input.grade_id, input.route_name ?? null],
    );
    return rows[0]!;
  },

  /**
   * Partial update. Builds the SET clause only from the fields provided so a
   * missing field is left untouched (rather than overwritten with NULL).
   */
  async update(id: number, input: UpdateRouteInput): Promise<Route | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.grade_id !== undefined) {
      values.push(input.grade_id);
      fields.push(`grade_id = $${values.length}`);
    }
    if (input.route_name !== undefined) {
      values.push(input.route_name);
      fields.push(`route_name = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const { rows } = await query<Route>(
      `UPDATE routes SET ${fields.join(', ')} WHERE route_id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  async remove(id: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM routes WHERE route_id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  },
};
