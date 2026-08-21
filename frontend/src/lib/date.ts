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
 * Which leaves one distinction worth keeping straight. DATE columns —
 * `visit_date`, `period_start` — arrive as bare `YYYY-MM-DD` strings and want
 * `formatDate`. TIMESTAMPTZ columns — every `created_at` — arrive as a UTC
 * instant and want `formatTimestamp`. They are not interchangeable: a report
 * generated at 9pm in Vancouver is stamped 04:00 the next day in UTC, and
 * reading a calendar date off the front of that string renders tomorrow.
 *
 * `sv-SE` is used for formatting because it happens to produce ISO
 * `YYYY-MM-DD`, which is what the API takes.
 */

import { currentLocale } from "../i18n";

/** Today, in the browser's timezone, as `YYYY-MM-DD`. */
export function todayString(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** This month, in the browser's timezone, as `YYYY-MM`. */
export function currentMonthKey(): string {
  return todayString().slice(0, 7);
}

/**
 * The locale to format dates in.
 *
 * Read from i18next at call time rather than captured once, so switching
 * language re-renders every date with it — "Aug 19, 2026" becomes
 * "2026年8月19日" without a reload. The BCP 47 tag Intl wants happens to be the
 * same string as the catalogue key for both languages here.
 */
function dateLocale(): string {
  return currentLocale();
}

/** Parse a `YYYY-MM-DD` at local midnight, never UTC. */
export function parseLocalDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00`);
}

/** "2026-08-19" -> "Aug 19, 2026", or "2026年8月19日" in Japanese. */
export function formatDate(date: string): string {
  return parseLocalDate(date).toLocaleDateString(dateLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * An ISO instant -> "Aug 19, 2026", in whatever timezone the reader is in.
 *
 * For TIMESTAMPTZ values, where the point in time is the thing and the
 * calendar day is derived from it. `formatDate` would take the UTC day off the
 * front of the string instead, which is a different day for most of the
 * evening anywhere west of Greenwich.
 */
export function formatTimestamp(instant: string): string {
  return new Date(instant).toLocaleDateString(dateLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "2026-08-19" -> "Aug 19". */
export function formatDayMonth(date: string): string {
  return parseLocalDate(date).toLocaleDateString(dateLocale(), {
    month: "short",
    day: "numeric",
  });
}

/** "2026-08" -> "Aug". */
export function formatMonthShort(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(dateLocale(), {
    month: "short",
  });
}

/** "2026-08" -> "August 2026". */
export function formatMonthLong(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(dateLocale(), {
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
