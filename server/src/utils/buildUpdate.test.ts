import { describe, expect, it } from "vitest";
import { buildUpdate } from "./buildUpdate";

/**
 * The whole point of this helper is that seven repositories no longer each
 * count their own `$n` placeholders. So the assertions below are mostly about
 * numbering: that WHERE parameters come after SET ones, that a skipped
 * undefined field does not leave a gap, and that a derived fragment binding its
 * own value still lands in the right slot.
 */

describe("buildUpdate", () => {
  it("writes only the fields that were provided", () => {
    const built = buildUpdate(
      "sessions",
      { visit_date: "2026-08-19", gym_name: undefined, duration_minutes: 90 },
      { session_id: 7, user_id: 3 },
      { returning: "*" },
    );

    expect(built).not.toBeNull();
    expect(built!.text).toBe(
      "UPDATE sessions SET visit_date = $1, duration_minutes = $2" +
        " WHERE session_id = $3 AND user_id = $4 RETURNING *",
    );
    expect(built!.values).toEqual(["2026-08-19", 90, 7, 3]);
  });

  it("keeps an explicit null, so a PATCH can clear a nullable column", () => {
    const built = buildUpdate("sessions", { gym_name: null }, { session_id: 1 });

    expect(built!.text).toBe("UPDATE sessions SET gym_name = $1 WHERE session_id = $2");
    expect(built!.values).toEqual([null, 1]);
  });

  it("returns null when there is nothing to write", () => {
    expect(
      buildUpdate("sessions", { gym_name: undefined }, { session_id: 1 }),
    ).toBeNull();
    expect(buildUpdate("sessions", {}, { session_id: 1 })).toBeNull();
  });

  it("omits RETURNING when the caller re-reads instead", () => {
    const built = buildUpdate("attempts", { note: "hi" }, { attempt_id: 2 });
    expect(built!.text).not.toContain("RETURNING");
  });

  it("numbers a derived fragment's own binding before the WHERE clause", () => {
    // This is goals: achieved_at is computed from the same value is_achieved
    // was set to, and both have to be bound before goal_id / user_id.
    const built = buildUpdate(
      "goals",
      { is_achieved: true },
      { goal_id: 5, user_id: 9 },
      {
        returning: "*",
        extra: (bind) => [
          `achieved_at = CASE WHEN ${bind(true)} THEN now() ELSE NULL END`,
        ],
      },
    );

    expect(built!.text).toBe(
      "UPDATE goals SET is_achieved = $1," +
        " achieved_at = CASE WHEN $2 THEN now() ELSE NULL END" +
        " WHERE goal_id = $3 AND user_id = $4 RETURNING *",
    );
    expect(built!.values).toEqual([true, true, 5, 9]);
  });

  it("accepts a derived fragment that binds nothing", () => {
    // This is injuries: resolved_on is derived from the new status with no
    // parameter of its own.
    const built = buildUpdate(
      "injuries",
      { status: "healed" },
      { injury_id: 4, user_id: 1 },
      { extra: () => ["resolved_on = COALESCE(resolved_on, CURRENT_DATE)"] },
    );

    expect(built!.text).toBe(
      "UPDATE injuries SET status = $1, resolved_on = COALESCE(resolved_on, CURRENT_DATE)" +
        " WHERE injury_id = $2 AND user_id = $3",
    );
    expect(built!.values).toEqual(["healed", 4, 1]);
  });

  it("still builds a statement when only the derived fragment applies", () => {
    const built = buildUpdate(
      "injuries",
      { status: undefined },
      { injury_id: 4 },
      { extra: () => ["resolved_on = NULL"] },
    );

    expect(built!.text).toBe(
      "UPDATE injuries SET resolved_on = NULL WHERE injury_id = $1",
    );
    expect(built!.values).toEqual([4]);
  });
});
