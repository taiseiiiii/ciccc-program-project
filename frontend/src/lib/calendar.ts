/**
 * Calendar helpers for month-scoped screens.
 *
 * Everything here works on plain `YYYY-MM` / `YYYY-MM-DD` strings, matching the
 * API's DATE columns. Month arithmetic is integer math rather than `Date`
 * arithmetic so a timezone can never nudge a boundary across a day.
 */

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Parse a plain calendar date at *local* midnight. `new Date("2026-08-03")` is
 * parsed as UTC midnight, which is still the 2nd anywhere west of Greenwich —
 * enough to shift every weekday in a calendar grid by one column.
 */
export const atLocalMidnight = (date: string): Date =>
  new Date(`${date}T00:00:00`);

/**
 * The user's *local* month as `YYYY-MM`. `toLocaleDateString("sv-SE")` gives
 * ISO-shaped output for the local date; `toISOString()` would be UTC, which
 * names the wrong month for a few hours around the 1st in Vancouver.
 */
export const currentMonth = (): string =>
  new Date().toLocaleDateString("sv-SE").slice(0, 7);

/** Shift a `YYYY-MM` string by whole months, rolling the year over as needed. */
export const shiftMonth = (month: string, delta: number): string => {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + delta; // 0-based, may leave 0..11
  const shiftedYear = year + Math.floor(index / 12);
  const shiftedMonth = (((index % 12) + 12) % 12) + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, "0")}`;
};

/** `2026-08` -> `August 2026`, in the browser's locale. */
export const monthLabel = (month: string): string =>
  atLocalMidnight(`${month}-01`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

/** `2026-08-03` -> `Aug 3`, in the browser's locale. */
export const dayLabel = (date: string): string =>
  atLocalMidnight(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

/** 0 = Monday .. 6 = Sunday. JS weeks start on Sunday; climbing weeks don't. */
export const weekdayIndex = (date: string): number =>
  (atLocalMidnight(date).getDay() + 6) % 7;

/**
 * Lay a month's worth of consecutive days out as a calendar: one row per
 * weekday, one column per week. `null` marks a cell before the 1st or after the
 * last day of the month, so callers can render it as a gap.
 *
 * `days` must be every day of one month, in order — which is exactly what
 * `GET /stats` returns.
 */
export const buildCalendar = <T extends { date: string }>(
  days: T[],
): (T | null)[][] => {
  if (days.length === 0) return [];

  const cells: (T | null)[] = [
    ...new Array<null>(weekdayIndex(days[0].date)).fill(null),
    ...days,
  ];
  // Pad the final week so every row has the same number of columns.
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = cells.length / 7;
  return WEEKDAYS.map((_, weekday) =>
    Array.from({ length: weeks }, (_, week) => cells[week * 7 + weekday]),
  );
};
