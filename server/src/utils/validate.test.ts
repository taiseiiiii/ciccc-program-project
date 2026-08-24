import { describe, expect, it } from "vitest";
import { HttpError } from "./HttpError";
import {
  optionalBoolean,
  optionalDate,
  optionalEnum,
  optionalIdArray,
  optionalInt,
  optionalLabelArray,
  optionalString,
  parseId,
  parseLimit,
  requireDate,
  requireEnum,
  requireInt,
} from "./validate";

/**
 * These helpers are the API's entire input contract, and the distinction they
 * all turn on is easy to break by accident: `undefined` means "the client did
 * not send this field, leave the column alone" and `null` means "the client
 * sent null, clear the column". Confusing the two is how a PATCH silently
 * wipes a field it was never asked to touch, so every optional* case below
 * asserts both.
 */

/** Assert that `fn` throws a 400 whose message names the offending field. */
function expectBadRequest(fn: () => unknown, field: string) {
  expect(fn).toThrow(HttpError);
  try {
    fn();
  } catch (err) {
    expect((err as HttpError).statusCode).toBe(400);
    expect((err as HttpError).message).toContain(field);
  }
}

describe("parseId", () => {
  it("accepts a positive integer string", () => {
    expect(parseId("42")).toBe(42);
  });

  it("rejects zero, negatives, fractions and junk", () => {
    for (const raw of ["0", "-1", "1.5", "abc", "", " ", "1e3"]) {
      expectBadRequest(() => parseId(raw), "id");
    }
  });

  it("names the field it was given", () => {
    expectBadRequest(() => parseId("nope", "session_id"), "session_id");
  });
});

describe("parseLimit", () => {
  it("passes undefined through so the repository default applies", () => {
    expect(parseLimit(undefined)).toBeUndefined();
  });

  it("accepts a page size inside the range", () => {
    expect(parseLimit("20")).toBe(20);
    expect(parseLimit("1")).toBe(1);
    expect(parseLimit("100")).toBe(100);
  });

  it("rejects zero, negatives and anything past the ceiling", () => {
    for (const raw of ["0", "-5", "101", "abc", "2.5"]) {
      expectBadRequest(() => parseLimit(raw), "limit");
    }
  });

  it("honours a custom ceiling", () => {
    expect(parseLimit("5", { max: 5 })).toBe(5);
    expectBadRequest(() => parseLimit("6", { max: 5 }), "limit");
  });
});

describe("requireInt", () => {
  it("accepts a positive integer", () => {
    expect(requireInt(7, "grade_id")).toBe(7);
  });

  it("rejects strings, zero, negatives and fractions", () => {
    for (const value of ["7", 0, -1, 1.5, null, undefined]) {
      expectBadRequest(() => requireInt(value, "grade_id"), "grade_id");
    }
  });
});

describe("optionalInt", () => {
  it("distinguishes absent from explicitly null", () => {
    expect(optionalInt(undefined, "severity")).toBeUndefined();
    expect(optionalInt(null, "severity")).toBeNull();
  });

  it("enforces the range at both ends", () => {
    expect(optionalInt(3, "severity", { min: 1, max: 5 })).toBe(3);
    expect(optionalInt(1, "severity", { min: 1, max: 5 })).toBe(1);
    expect(optionalInt(5, "severity", { min: 1, max: 5 })).toBe(5);
    expectBadRequest(() => optionalInt(0, "severity", { min: 1, max: 5 }), "severity");
    expectBadRequest(() => optionalInt(6, "severity", { min: 1, max: 5 }), "severity");
  });

  it("rejects a non-integer", () => {
    expectBadRequest(() => optionalInt(1.5, "severity"), "severity");
    expectBadRequest(() => optionalInt("3", "severity"), "severity");
  });
});

describe("optionalString", () => {
  it("distinguishes absent from explicitly null", () => {
    expect(optionalString(undefined, "note")).toBeUndefined();
    expect(optionalString(null, "note")).toBeNull();
  });

  it("keeps an empty string, which is not the same as clearing", () => {
    expect(optionalString("", "note")).toBe("");
  });

  it("enforces maxLength", () => {
    expect(optionalString("abc", "note", 3)).toBe("abc");
    expectBadRequest(() => optionalString("abcd", "note", 3), "note");
  });

  it("rejects a non-string", () => {
    expectBadRequest(() => optionalString(5, "note"), "note");
  });
});

describe("optionalBoolean", () => {
  it("accepts both booleans and passes undefined through", () => {
    expect(optionalBoolean(true, "is_pinned")).toBe(true);
    expect(optionalBoolean(false, "is_pinned")).toBe(false);
    expect(optionalBoolean(undefined, "is_pinned")).toBeUndefined();
  });

  it("rejects the truthy strings a form might send", () => {
    for (const value of ["true", 1, 0, null]) {
      expectBadRequest(() => optionalBoolean(value, "is_pinned"), "is_pinned");
    }
  });
});

describe("optionalEnum", () => {
  const SIDES = ["left", "right", "both"] as const;

  it("accepts a member and distinguishes absent from null", () => {
    expect(optionalEnum("left", "side", SIDES)).toBe("left");
    expect(optionalEnum(undefined, "side", SIDES)).toBeUndefined();
    expect(optionalEnum(null, "side", SIDES)).toBeNull();
  });

  it("rejects a non-member and lists the options", () => {
    expectBadRequest(() => optionalEnum("middle", "side", SIDES), "side");
    try {
      optionalEnum("middle", "side", SIDES);
    } catch (err) {
      expect((err as HttpError).message).toContain("left, right, both");
    }
  });
});

describe("requireEnum", () => {
  const FORMATS = ["image", "video"] as const;

  it("accepts a member", () => {
    expect(requireEnum("video", "format", FORMATS)).toBe("video");
  });

  // The one thing it adds over optionalEnum: absence is an error, because the
  // field is what the request is about. Both absent forms are asserted.
  it("rejects an absent field, undefined and null alike", () => {
    expectBadRequest(() => requireEnum(undefined, "format", FORMATS), "format");
    expectBadRequest(() => requireEnum(null, "format", FORMATS), "format");
  });

  it("rejects a non-member and lists the options", () => {
    expectBadRequest(() => requireEnum("gif", "format", FORMATS), "format");
    try {
      requireEnum("gif", "format", FORMATS);
    } catch (err) {
      expect((err as HttpError).message).toContain("image, video");
    }
  });
});

describe("requireDate / optionalDate", () => {
  it("accepts a YYYY-MM-DD string", () => {
    expect(requireDate("2026-08-19", "visit_date")).toBe("2026-08-19");
  });

  it("rejects other date shapes", () => {
    for (const value of ["19/08/2026", "2026-8-9", "2026-08-19T00:00:00Z", 0, null]) {
      expectBadRequest(() => requireDate(value, "visit_date"), "visit_date");
    }
  });

  it("lets an optional date be absent or explicitly cleared", () => {
    expect(optionalDate(undefined, "target_date")).toBeUndefined();
    expect(optionalDate(null, "target_date")).toBeNull();
  });
});

describe("optionalIdArray", () => {
  it("treats absent and null alike — neither is 'cleared'", () => {
    expect(optionalIdArray(undefined, "wall_type_ids")).toBeUndefined();
    expect(optionalIdArray(null, "wall_type_ids")).toBeUndefined();
  });

  it("keeps an empty array, which IS how a client clears the tags", () => {
    expect(optionalIdArray([], "wall_type_ids")).toEqual([]);
  });

  it("collapses duplicates so the join-table insert does not have to", () => {
    expect(optionalIdArray([3, 1, 3, 1], "wall_type_ids")).toEqual([3, 1]);
  });

  it("rejects a non-array and names the offending index", () => {
    expectBadRequest(() => optionalIdArray("1,2", "wall_type_ids"), "wall_type_ids");
    expectBadRequest(() => optionalIdArray([1, 0], "wall_type_ids"), "wall_type_ids[1]");
    expectBadRequest(() => optionalIdArray([1, "2"], "wall_type_ids"), "wall_type_ids[1]");
  });
});

describe("optionalLabelArray", () => {
  it("trims entries and drops blank ones rather than rejecting them", () => {
    // A climber tabbing past an empty free-text box is not an error.
    expect(optionalLabelArray(["  footwork ", "", "   "], "weakness_labels")).toEqual([
      "footwork",
    ]);
  });

  it("enforces the per-entry length limit", () => {
    expect(optionalLabelArray(["abc"], "weakness_labels", 3)).toEqual(["abc"]);
    expectBadRequest(
      () => optionalLabelArray(["abcd"], "weakness_labels", 3),
      "weakness_labels[0]",
    );
  });

  it("rejects a non-string entry", () => {
    expectBadRequest(() => optionalLabelArray([1], "weakness_labels"), "weakness_labels[0]");
  });
});
