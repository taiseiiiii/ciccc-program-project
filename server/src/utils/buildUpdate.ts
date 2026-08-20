/**
 * Builder for the partial-UPDATE statement every repository needs.
 *
 * A PATCH only ever writes the fields it was given: a column missing from the
 * body must be left alone, not overwritten with NULL. Each repository used to
 * spell that out for itself — a `fields` array, a `values` array, a `push()`
 * closure, one `if (input.x !== undefined)` per column, then manual index
 * bookkeeping for the WHERE clause. Seven copies of one idea is seven chances
 * to get a `$n` wrong, and a wrong `$n` is a silent data bug rather than a
 * crash.
 *
 * Safety note: `table`, the keys of `set` and the keys of `where` are
 * interpolated into the SQL, because identifiers cannot be bound as
 * parameters. Every call site passes string literals — never anything derived
 * from a request. All *values* go through $1, $2, ... as usual.
 */

/** A derived SET fragment, e.g. `resolved_on = COALESCE(resolved_on, CURRENT_DATE)`. */
export type ExtraFragments = (bind: (value: unknown) => string) => string[];

export interface BuildUpdateOptions {
  /** RETURNING clause. Omit when the caller re-reads instead (joined shapes). */
  returning?: string;
  /**
   * Extra SET fragments for columns derived from the input rather than copied
   * from it. `bind` adds a value and hands back its `$n` placeholder, so a
   * fragment can reference parameters safely.
   */
  extra?: ExtraFragments;
}

export interface BuiltUpdate {
  text: string;
  values: unknown[];
}

/**
 * Build an UPDATE from the fields that were actually provided.
 *
 * Entries in `set` whose value is `undefined` are skipped; `null` is kept, so a
 * PATCH can still clear a nullable column. Returns `null` when there is nothing
 * to write at all — callers treat that as "no-op" and re-read the row instead.
 */
export function buildUpdate(
  table: string,
  set: Record<string, unknown>,
  where: Record<string, unknown>,
  options: BuildUpdateOptions = {},
): BuiltUpdate | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  for (const [column, value] of Object.entries(set)) {
    if (value === undefined) continue;
    fields.push(`${column} = ${bind(value)}`);
  }

  if (options.extra) {
    fields.push(...options.extra(bind));
  }

  if (fields.length === 0) return null;

  const conditions = Object.entries(where).map(
    ([column, value]) => `${column} = ${bind(value)}`,
  );

  return {
    text:
      `UPDATE ${table} SET ${fields.join(", ")}` +
      ` WHERE ${conditions.join(" AND ")}` +
      (options.returning ? ` RETURNING ${options.returning}` : ""),
    values,
  };
}
