/**
 * Date-range helpers for the AI analysis and stats endpoints. All work on plain
 * 'YYYY-MM-DD' strings (the format DATE columns use throughout the API) and
 * do the arithmetic in UTC so a server timezone can never shift the day.
 *
 * Range convention: every helper that produces a pair produces a half-open
 * range `[start, end)`. Mixing half-open and inclusive ends across the
 * aggregation queries is exactly the kind of thing that silently drops or
 * double-counts the last day of a month, so there is one convention here and
 * the repository sticks to it.
 */

/** True for a well-formed `YYYY-MM-DD` string. */
export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** True for a well-formed `YYYY-MM` string. */
export function isMonthString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

/** Today's date in the server's local timezone as `YYYY-MM-DD`. */
export function todayString(): string {
  // sv-SE happens to format dates as ISO YYYY-MM-DD.
  return new Date().toLocaleDateString("sv-SE");
}

/** First and last day of the month containing `date`, both inclusive. */
export function monthBounds(date: string): { start: string; end: string } {
  const [year, month] = date.split("-").map(Number) as [number, number];
  // Day 0 of the next month = last day of this month.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = date.slice(0, 7);
  return {
    start: `${prefix}-01`,
    end: `${prefix}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** The date `days` days before `date` (0 returns `date` itself). */
export function daysBefore(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = new Date(Date.UTC(year, month - 1, day - days));
  return d.toISOString().slice(0, 10);
}

/** The day after `date`. Turns an inclusive end into a half-open one. */
export function dayAfter(date: string): string {
  return daysBefore(date, -1);
}

/** `YYYY-MM` shifted by `delta` months (negative goes back). */
export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** The half-open `[start, end)` range covering one `YYYY-MM`. */
export function monthRange(month: string): { start: string; end: string } {
  return {
    start: `${month}-01`,
    end: `${addMonths(month, 1)}-01`,
  };
}
