import { query } from '../db/pool';

/** Shape of a row in the `grades` table (V0–V17 master data). */
export interface Grade {
  grade_id: number;
  grade_name: string; // label, e.g. "V0" .. "V17"
  level: number; // ordering, 0..17
  created_at: string;
  updated_at: string;
}

/**
 * Data-access layer for grades. Grades are reference/master data (seeded once),
 * so only read operations are exposed here.
 */
export const gradeRepository = {
  async findAll(): Promise<Grade[]> {
    const { rows } = await query<Grade>(
      `SELECT * FROM grades ORDER BY level ASC`,
    );
    return rows;
  },

  async findById(id: number): Promise<Grade | null> {
    const { rows } = await query<Grade>(
      `SELECT * FROM grades WHERE grade_id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },
};
