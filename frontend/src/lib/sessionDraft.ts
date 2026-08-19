import type AttemptType from "../types/AttemptType";

/**
 * Crash protection for the log-session form.
 *
 * A gym visit is typed in over an hour and none of it reaches the server until
 * "Save Session" is pressed — "Add Route" only puts a climb in a list held in
 * React state. Reloading, closing the PWA or tapping another nav item used to
 * throw the whole visit away without a word, which is exactly what climbers
 * reported as "I logged a bunch of stuff and it didn't save".
 *
 * So the form mirrors itself here after every change and reads it back on
 * mount. localStorage rather than the query cache, because it has to outlive
 * the page itself.
 *
 * Staged files are the one thing that cannot come back: a File is a handle to
 * bytes the page no longer owns once it has been torn down, and nothing
 * serialisable stands in for it. `had_files` records that some were picked, so
 * the climber is told to pick them again rather than a session quietly saving
 * without its photos.
 */

/**
 * Bumped whenever the stored shape changes, so an old draft is ignored rather
 * than restored into fields that no longer exist.
 */
const STORAGE_KEY = "climblog:session-draft:v1";

/** A drafted climb as stored — everything except the File handles. */
export type StoredClimb = AttemptType;

/** The whole form: the visit's header fields, the added routes, and the one
 *  still being filled in. */
export interface StoredDraft {
  /** Absent when what was stored is not a usable date; the form falls back to
   *  today. */
  visit_date?: string;
  gym_name: string;
  /** Kept as the raw input string, so a half-typed number round-trips as typed. */
  duration_minutes: string;
  draft: StoredClimb;
  climbs: StoredClimb[];
  had_files: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asCount = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isInteger(value) ? value : fallback;

const asIds = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.filter((id): id is number => typeof id === "number")
    : [];

const asLabels = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((label): label is string => typeof label === "string")
    : [];

/**
 * Coerce a stored climb back into the shape the form expects.
 *
 * Nothing read out of localStorage is trusted: it is user-writable, it outlives
 * the build that wrote it, and a missing array here would crash the log screen
 * on mount — a worse failure than the one this file exists to prevent.
 */
function normaliseClimb(raw: unknown): StoredClimb | null {
  if (!raw || typeof raw !== "object") return null;
  const climb = raw as Record<string, unknown>;

  return {
    id: asCount(climb.id, Date.now()),
    grade_name: asText(climb.grade_name) || "V0",
    route_name: asText(climb.route_name),
    attempt_count: Math.max(1, asCount(climb.attempt_count, 1)),
    send_count: Math.max(0, asCount(climb.send_count, 0)),
    note: asText(climb.note),
    wall_type_ids: asIds(climb.wall_type_ids),
    hold_type_ids: asIds(climb.hold_type_ids),
    weakness_type_ids: asIds(climb.weakness_type_ids),
    weakness_labels: asLabels(climb.weakness_labels),
  };
}

/** The saved draft, or null when there is none worth restoring. */
export function readSessionDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;

    // No in-progress climb means nothing coherent to restore into the form.
    const draft = normaliseClimb(parsed.draft);
    if (!draft) return null;

    const visitDate = asText(parsed.visit_date);

    return {
      ...(DATE_PATTERN.test(visitDate) ? { visit_date: visitDate } : {}),
      gym_name: asText(parsed.gym_name),
      duration_minutes: asText(parsed.duration_minutes),
      draft,
      climbs: Array.isArray(parsed.climbs)
        ? parsed.climbs
            .map(normaliseClimb)
            .filter((climb): climb is StoredClimb => climb !== null)
        : [],
      had_files: parsed.had_files === true,
    };
  } catch {
    return null;
  }
}

export function writeSessionDraft(draft: StoredDraft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private-mode Safari and a full quota both throw here. Losing the backup
    // is not a reason to break the form the climber is typing into.
  }
}

export function clearSessionDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See writeSessionDraft.
  }
}
