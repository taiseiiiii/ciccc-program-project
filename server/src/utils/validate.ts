import { HttpError } from "./HttpError";

/**
 * Request-validation helpers shared by the controllers.
 *
 * Controllers hand-check their bodies rather than pulling in a schema library,
 * which is fine for two or three fields but stopped being fine once a logged
 * climb grew tag arrays, counts and free-text labels. These keep the checks
 * one-line and, more importantly, keep the error messages consistent — the
 * client shows them verbatim.
 *
 * Every function names the offending field, because "Bad Request" tells the
 * climber filling in the form nothing at all.
 */

/**
 * Plain digits, no sign, no leading zero, no separators. Deliberately stricter
 * than `Number()`, which happily reads "1e3" as 1000, "0x10" as 16 and " 12 "
 * as 12 — so `/attempts/1e3` used to be a valid way to ask for attempt 1000.
 * An id in a URL has exactly one spelling.
 */
const ID_PATTERN = /^[1-9][0-9]*$/;

/** Parse and validate a numeric route param (e.g. :id). */
export function parseId(raw: string, field = "id"): number {
  if (!ID_PATTERN.test(raw)) {
    throw HttpError.badRequest(`Invalid ${field}: ${raw}`);
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) {
    throw HttpError.badRequest(`Invalid ${field}: ${raw}`);
  }
  return id;
}

/**
 * A `?limit=` query parameter. Absent stays undefined so the repository's own
 * default applies; anything present has to be a sane page size.
 */
export function parseLimit(
  value: unknown,
  { max = 100 }: { max?: number } = {},
): number | undefined {
  if (value === undefined) return undefined;
  // Same reasoning as parseId: plain digits only, so "1e9" is a 400 rather than
  // a billion-row page.
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw HttpError.badRequest(`limit must be an integer between 1 and ${max}`);
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > max) {
    throw HttpError.badRequest(`limit must be an integer between 1 and ${max}`);
  }
  return limit;
}

/**
 * An `?offset=` query parameter. Absent stays undefined so the repository's own
 * default applies.
 *
 * `ID_PATTERN` rejects a leading zero and a leading minus, so 0 needs its own
 * case — it is the first page, and by far the most common value.
 */
export function parseOffset(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (value === "0") return 0;
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw HttpError.badRequest("offset must be a non-negative integer");
  }
  const offset = Number(value);
  if (!Number.isSafeInteger(offset)) {
    throw HttpError.badRequest("offset must be a non-negative integer");
  }
  return offset;
}

/**
 * A `?flag=true|false` query parameter.
 *
 * Absent stays undefined, which callers read as "no filter" rather than
 * "filter on false" — the difference between browsing every report and
 * browsing only the unpinned ones.
 */
export function parseQueryBoolean(
  value: unknown,
  field: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw HttpError.badRequest(`${field} must be 'true' or 'false'`);
}

/**
 * One of a fixed set of string values — the shape every status/side/kind field
 * takes. Returns undefined for an absent optional field and null for an
 * explicit null, matching the other optional* helpers.
 */
export function optionalEnum<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw HttpError.badRequest(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T[number];
}

/** A required positive integer from a request body. */
export function requireInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw HttpError.badRequest(`${field} is required and must be a positive integer`);
  }
  return value;
}

/**
 * An optional integer within [min, max]. `undefined` passes through unchanged;
 * `null` is kept as null so a PATCH can clear a nullable column.
 */
export function optionalInt(
  value: unknown,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw HttpError.badRequest(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw HttpError.badRequest(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

/** An optional string. Null is allowed and means "clear this field". */
export function optionalString(
  value: unknown,
  field: string,
  maxLength?: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw HttpError.badRequest(`${field} must be a string`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw HttpError.badRequest(`${field} must be ${maxLength} characters or fewer`);
  }
  return value;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw HttpError.badRequest(`${field} must be a boolean`);
  }
  return value;
}

/** A required `YYYY-MM-DD` string. */
export function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw HttpError.badRequest(`${field} is required and must be a YYYY-MM-DD date`);
  }
  return value;
}

/** An optional `YYYY-MM-DD` string. Null is allowed. */
export function optionalDate(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw HttpError.badRequest(`${field} must be a YYYY-MM-DD date`);
  }
  return value;
}

/**
 * An optional array of positive integers — the shape every tag selection
 * arrives in. Duplicates are collapsed here so the join-table insert does not
 * have to care, and an omitted field returns undefined rather than [] so
 * callers can tell "not sent" from "cleared".
 */
export function optionalIdArray(
  value: unknown,
  field: string,
): number[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw HttpError.badRequest(`${field} must be an array of ids`);
  }
  const ids = value.map((raw, i) => {
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
      throw HttpError.badRequest(`${field}[${i}] must be a positive integer`);
    }
    return raw;
  });
  return [...new Set(ids)];
}

/**
 * An optional array of non-empty strings, trimmed. Used for the free-text
 * "other" boxes; blank entries are dropped rather than rejected, because a
 * climber tabbing past an empty field is not an error.
 */
export function optionalLabelArray(
  value: unknown,
  field: string,
  maxLength = 60,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw HttpError.badRequest(`${field} must be an array of strings`);
  }
  const labels: string[] = [];
  for (const [i, raw] of value.entries()) {
    if (typeof raw !== "string") {
      throw HttpError.badRequest(`${field}[${i}] must be a string`);
    }
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    if (trimmed.length > maxLength) {
      throw HttpError.badRequest(
        `${field}[${i}] must be ${maxLength} characters or fewer`,
      );
    }
    labels.push(trimmed);
  }
  return labels;
}
