import { query } from "../db/pool";

/**
 * Read-only master data for the three tag vocabularies the log and injury
 * forms render as buttons: wall angles, hold types and body parts.
 *
 * These share one file rather than getting a repository each (the way grades
 * do) because they are the same table three times over — same columns, same
 * "list them in sort_order" query, same immutability. Three near-identical
 * files would be duplication, not structure. The rows are created by
 * migrations 0005 and 0010, so there is nothing to write here.
 */

/** A row in any of the three master tables, with its own id column aliased. */
export interface TaxonomyTerm {
  id: number;
  code: string;
  label: string;
  sort_order: number;
}

/**
 * Whitelist of the tables this repository may read, mapped to their primary
 * key. The key is interpolated into the SQL (identifiers cannot be bound as
 * parameters), so it must never come from a request — only from these keys.
 */
const TABLES = {
  wall_types: "wall_type_id",
  hold_types: "hold_type_id",
  body_parts: "body_part_id",
} as const;

export type TaxonomyTable = keyof typeof TABLES;

async function findAll(table: TaxonomyTable): Promise<TaxonomyTerm[]> {
  const { rows } = await query<TaxonomyTerm>(
    `SELECT ${TABLES[table]} AS id, code, label, sort_order
     FROM ${table}
     ORDER BY sort_order ASC`,
  );
  return rows;
}

export const taxonomyRepository = {
  findAll,

  findWallTypes: () => findAll("wall_types"),
  findHoldTypes: () => findAll("hold_types"),
  findBodyParts: () => findAll("body_parts"),

  /**
   * Which of the given ids actually exist. The log form sends tag ids straight
   * from the client, so they are checked before use — an unknown id should be
   * a 400, not a foreign-key error surfacing as a 500.
   */
  async findExistingIds(
    table: TaxonomyTable,
    ids: number[],
  ): Promise<Set<number>> {
    if (ids.length === 0) return new Set();
    const { rows } = await query<{ id: number }>(
      `SELECT ${TABLES[table]} AS id FROM ${table} WHERE ${TABLES[table]} = ANY($1::int[])`,
      [ids],
    );
    return new Set(rows.map((r) => r.id));
  },
};
