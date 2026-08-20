import { describe, expect, it } from "vitest";
import {
  addMonths,
  dayAfter,
  daysBefore,
  isDateString,
  isMonthString,
  monthBounds,
  monthRange,
} from "./period";

/**
 * These are the date functions every aggregate depends on, and every bug they
 * can have is an off-by-one-day that nobody notices until a month boundary.
 * So the cases here are deliberately the awkward ones: leap days, year ends,
 * 31-day months, and the DST changeover — which is where doing this arithmetic
 * in local time instead of UTC would go wrong.
 */

describe("isDateString", () => {
  it("accepts a YYYY-MM-DD string", () => {
    expect(isDateString("2026-08-19")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const value of ["2026-8-19", "19-08-2026", "2026-08", "", 20260819, null]) {
      expect(isDateString(value)).toBe(false);
    }
  });
});

describe("isMonthString", () => {
  it("accepts YYYY-MM and rejects a full date", () => {
    expect(isMonthString("2026-08")).toBe(true);
    expect(isMonthString("2026-08-19")).toBe(false);
  });
});

describe("monthBounds", () => {
  it("covers a 31-day month", () => {
    expect(monthBounds("2026-08-19")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("covers a 30-day month", () => {
    expect(monthBounds("2026-04-07")).toEqual({
      start: "2026-04-01",
      end: "2026-04-30",
    });
  });

  it("gets February right in a common year", () => {
    expect(monthBounds("2026-02-14").end).toBe("2026-02-28");
  });

  it("gets February right in a leap year", () => {
    expect(monthBounds("2028-02-14").end).toBe("2028-02-29");
  });
});

describe("daysBefore", () => {
  it("returns the date itself for 0", () => {
    expect(daysBefore("2026-08-19", 0)).toBe("2026-08-19");
  });

  it("steps back across a month boundary", () => {
    expect(daysBefore("2026-08-01", 1)).toBe("2026-07-31");
  });

  it("steps back across a year boundary", () => {
    expect(daysBefore("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("steps back across a leap day", () => {
    expect(daysBefore("2028-03-01", 1)).toBe("2028-02-29");
  });

  it("covers the 30-day window the training plan uses", () => {
    expect(daysBefore("2026-08-19", 29)).toBe("2026-07-21");
  });

  it("does not lose a day across a DST transition", () => {
    // North American DST starts 2026-03-08. Local-time arithmetic would make
    // this 23 hours and land on the wrong day.
    expect(daysBefore("2026-03-09", 1)).toBe("2026-03-08");
    expect(daysBefore("2026-03-08", 1)).toBe("2026-03-07");
  });
});

describe("dayAfter", () => {
  it("turns an inclusive end into a half-open one", () => {
    expect(dayAfter("2026-08-31")).toBe("2026-09-01");
    expect(dayAfter("2026-12-31")).toBe("2027-01-01");
    expect(dayAfter("2028-02-28")).toBe("2028-02-29");
  });
});

describe("addMonths", () => {
  it("moves forward and back within a year", () => {
    expect(addMonths("2026-08", 1)).toBe("2026-09");
    expect(addMonths("2026-08", -1)).toBe("2026-07");
  });

  it("wraps across the year boundary in both directions", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("handles the four-month step the dashboard charts use", () => {
    expect(addMonths("2026-02", -4)).toBe("2025-10");
  });
});

describe("monthRange", () => {
  it("produces a half-open range whose end is the next month's first", () => {
    expect(monthRange("2026-08")).toEqual({
      start: "2026-08-01",
      end: "2026-09-01",
    });
  });

  it("wraps into the next year", () => {
    expect(monthRange("2026-12")).toEqual({
      start: "2026-12-01",
      end: "2027-01-01",
    });
  });

  it("ends February on March 1st in a leap year, so the 29th is included", () => {
    expect(monthRange("2028-02").end).toBe("2028-03-01");
  });
});
