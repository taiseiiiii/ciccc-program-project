import { describe, expect, it, vi } from "vitest";
import { filterUnsafeDrills, type TrainingDrill } from "./ai.service";

// `filterUnsafeDrills` is a pure function, but it sits beside the OpenAI
// transport, which reads config/env when it loads and throws without a
// DATABASE_URL. Hoisted rather than stubbed in the body: the import below runs
// first otherwise. (app.test.ts gets away with vi.stubEnv because it imports
// the app lazily, inside beforeAll.)
//
// `??=` so a developer's own .env still wins locally; this is only here to make
// the suite runnable on a machine that has none, CI included.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://u:p@localhost:5432/climb_app_test";
  process.env.SUPABASE_URL ??= "https://test.supabase.co";
});

/**
 * The injury guardrail's second layer.
 *
 * The prompt already tells the model not to load an injured body part. This is
 * the check that it did not, and it is the one piece of logic in the app whose
 * failure mode is somebody getting hurt — a hangboard drill handed to a climber
 * with a torn pulley. So it is tested as a safety control: deliberately
 * over-broad, and asserted to stay that way.
 */

const drill = (title: string, description = ""): TrainingDrill => ({
  title,
  description,
  priority: "high",
  frequency: "2x per week",
});

const INJURED_FINGER = [{ body_part: "Finger", status: "active", severity: 3 }];

describe("filterUnsafeDrills", () => {
  it("passes everything through when nothing is injured", () => {
    const drills = [drill("Hangboard repeaters"), drill("Slab footwork")];
    expect(filterUnsafeDrills(drills, [], [])).toEqual({ drills, removed: [] });
  });

  it("drops a drill whose title loads the injured part", () => {
    const result = filterUnsafeDrills(
      [drill("Hangboard repeaters"), drill("Slab footwork")],
      INJURED_FINGER,
      ["finger"],
    );

    expect(result.drills.map((d) => d.title)).toEqual(["Slab footwork"]);
    expect(result.removed).toEqual(["Hangboard repeaters"]);
  });

  it("also reads the description, not just the title", () => {
    // The model routinely names the exercise innocuously and describes the
    // dangerous part underneath.
    const result = filterUnsafeDrills(
      [drill("Strength block", "Add deadhangs on a 20mm edge, 7 seconds on.")],
      INJURED_FINGER,
      ["finger"],
    );

    expect(result.drills).toHaveLength(0);
    expect(result.removed).toEqual(["Strength block"]);
  });

  it("matches case-insensitively", () => {
    const result = filterUnsafeDrills(
      [drill("CAMPUS BOARD LADDERS")],
      INJURED_FINGER,
      ["finger"],
    );
    expect(result.removed).toEqual(["CAMPUS BOARD LADDERS"]);
  });

  it("covers every injured part, not just the first", () => {
    const result = filterUnsafeDrills(
      [drill("Heel hook drills"), drill("Hangboard"), drill("Core circuit")],
      [
        { body_part: "Knee", status: "active", severity: 2 },
        { body_part: "Finger", status: "recovering", severity: 1 },
      ],
      ["knee", "finger"],
    );

    expect(result.drills.map((d) => d.title)).toEqual(["Core circuit"]);
    expect(result.removed).toEqual(["Heel hook drills", "Hangboard"]);
  });

  it("keeps a plan that is genuinely safe for the injured part", () => {
    const drills = [drill("Slab footwork", "Silent feet on low-angle terrain.")];
    const result = filterUnsafeDrills(drills, INJURED_FINGER, ["finger"]);
    expect(result.drills).toEqual(drills);
    expect(result.removed).toEqual([]);
  });

  it("errs toward removing: a shoulder injury drops pull-ups", () => {
    // Over-broad on purpose. Dropping a safe drill costs one suggestion;
    // keeping an unsafe one costs the climber their season.
    const result = filterUnsafeDrills(
      [drill("Weighted pull-ups")],
      [{ body_part: "Shoulder", status: "active", severity: 4 }],
      ["shoulder"],
    );
    expect(result.removed).toEqual(["Weighted pull-ups"]);
  });

  it("leaves the plan alone for a body part with no keyword list", () => {
    // 'other' has no keywords, so there is nothing to match on — the plan is
    // returned untouched rather than emptied.
    const drills = [drill("Hangboard repeaters")];
    const result = filterUnsafeDrills(
      drills,
      [{ body_part: "Other", status: "active", severity: null }],
      ["other"],
    );
    expect(result.drills).toEqual(drills);
    expect(result.removed).toEqual([]);
  });
});
