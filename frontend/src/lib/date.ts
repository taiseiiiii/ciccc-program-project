/**
 * Local-date helpers, shared by every screen.
 *
 * Two rules the whole app depends on, both easy to get wrong in isolation and
 * both previously re-derived per file:
 *
 *   1. "Today" and "this month" are the *climber's*, not the server's. A
 *      session logged at 11pm in Vancouver belongs to that day, and every date
 *      the client sends carries that assumption.
 *   2. A bare `YYYY-MM-DD` passed to `new Date()` is parsed as UTC, so
 *      formatting one without pinning it to local midnight can render the day
 *      before. Anything here that turns a date string into a Date does that
 *      pinning.
 *
 * `sv-SE` is used for formatting because it happens to produce ISO
 * `YYYY-MM-DD`, which is what the API takes.
 */

/** Today, in the browser's timezone, as `YYYY-MM-DD`. */
export function todayString(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** This month, in the browser's timezone, as `YYYY-MM`. */
export function currentMonthKey(): string {
  return todayString().slice(0, 7);
}

/** Parse a `YYYY-MM-DD` at local midnight, never UTC. */
export function parseLocalDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00`);
}

/** "2026-08-19" -> "Aug 19, 2026". */
export function formatDate(date: string): string {
  return parseLocalDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "2026-08-19" -> "Aug 19". */
export function formatDayMonth(date: string): string {
  return parseLocalDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "2026-08" -> "Aug". */
export function formatMonthShort(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
  });
}

/** "2026-08" -> "August 2026". */
export function formatMonthLong(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Whole days from today until `date`. Negative once the date has passed. */
export function daysUntil(date: string): number {
  return Math.ceil(
    (parseLocalDate(date).getTime() - new Date().setHours(0, 0, 0, 0)) /
      86_400_000,
  );
}

/** Whole days since `date`, never negative. */
export function daysSince(date: string): number {
  return Math.max(0, -daysUntil(date));
}

/** 135 -> "2h 15m". Minutes alone stop being readable past an hour or two. */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "3 days" / "1 day" — the plural rule this app writes out constantly. */
export function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
