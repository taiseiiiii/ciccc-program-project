import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Application } from "express";

/**
 * HTTP-level tests for the rules that are not visible in any single function:
 * which paths need a token, which verbs exist at all, and what an unknown path
 * answers.
 *
 * The database and the token verifier are both mocked. That is deliberate —
 * these assertions are about routing and the shape of the API surface, and
 * every one of them would still pass against a real Postgres. The queries
 * themselves are covered by the repository's own SQL and by the unit tests.
 */

// Set before anything imports config/env, which throws on a missing DATABASE_URL.
vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/climb_app_test");
vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("NODE_ENV", "test");

const TOKEN = "Bearer test-token";

vi.mock("./db/pool", () => ({
  pool: { connect: vi.fn(), end: vi.fn(), on: vi.fn(), query: vi.fn() },
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  pingDatabase: vi.fn().mockResolvedValue(true),
}));

vi.mock("./middleware/auth", async () => {
  const { HttpError } = await import("./utils/HttpError");
  return {
    requireAuth: (
      req: { headers: Record<string, string | undefined>; user?: unknown },
      _res: unknown,
      next: (err?: unknown) => void,
    ) => {
      if (req.headers.authorization !== TOKEN) {
        return next(HttpError.unauthorized("Missing bearer token"));
      }
      req.user = {
        user_id: 1,
        auth_user_id: "00000000-0000-0000-0000-000000000001",
        email: "climber@example.com",
        first_name: "Test",
        last_name: "Climber",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      next();
    },
  };
});

let app: Application;

beforeAll(async () => {
  const { createApp } = await import("./app");
  app = createApp();
});

describe("public surface", () => {
  // The root used to answer with a service descriptor. It was removed after it
  // turned out to be the one path Vercel could not invoke — every other path,
  // matched or not, was served correctly. Asserted rather than deleted so that
  // re-adding a "/" route is a decision someone makes on purpose.
  it("has nothing at the root", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(404);
  });

  it("answers the health check without a token", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "up" });
  });

  it("serves the OpenAPI spec", async () => {
    const res = await request(app).get("/api/v1/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("openapi:");
  });

  it("tags every response with a request id", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("authentication", () => {
  const guarded = [
    "/api/v1/users/me",
    "/api/v1/sessions",
    "/api/v1/attempts",
    "/api/v1/routes",
    "/api/v1/goals",
    "/api/v1/grades",
    "/api/v1/wall-types",
    "/api/v1/hold-types",
    "/api/v1/body-parts",
    "/api/v1/weaknesses",
    "/api/v1/media",
    "/api/v1/injuries",
    "/api/v1/stats",
    "/api/v1/performances",
    "/api/v1/trainings",
    "/api/v1/share-events",
  ];

  it.each(guarded)("rejects %s without a token", async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Missing bearer token");
  });
});

describe("unknown paths", () => {
  // Regression: requireAuth used to be one blanket router.use() above every
  // resource, so it ran before routing and answered 401 for paths that matched
  // nothing at all. The 404 handler was unreachable for the whole API, and a
  // typo'd URL looked like an auth failure.
  it("answers 404, not 401, for a path that matches no resource", async () => {
    const res = await request(app).get("/api/v1/nope").set("Authorization", TOKEN);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("Route not found");
  });

  it("still answers 404 for an unknown path with no token", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
  });
});

describe("routes are read-only", () => {
  // Regression: PATCH and DELETE here took any route id and checked no
  // ownership, so any signed-in caller could re-grade or delete another
  // climber's logged route. `routes` has no user_id to check against, so the
  // verbs are gone rather than guarded.
  it("has no PATCH /routes/:id", async () => {
    const res = await request(app)
      .patch("/api/v1/routes/1")
      .set("Authorization", TOKEN)
      .send({ grade_id: 9 });
    expect(res.status).toBe(404);
  });

  it("has no DELETE /routes/:id", async () => {
    const res = await request(app)
      .delete("/api/v1/routes/1")
      .set("Authorization", TOKEN);
    expect(res.status).toBe(404);
  });

  it("has no POST /routes", async () => {
    const res = await request(app)
      .post("/api/v1/routes")
      .set("Authorization", TOKEN)
      .send({ grade_id: 1 });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /attempts/:id", () => {
  // Regression: route_id was accepted after only an existence check, so an
  // attempt could be aimed at a stranger's route — disclosing its name and
  // grade through the joined response, and overwriting its tags.
  it("refuses route_id and says what to send instead", async () => {
    const res = await request(app)
      .patch("/api/v1/attempts/1")
      .set("Authorization", TOKEN)
      .send({ route_id: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("route_id cannot be changed");
    expect(res.body.error.message).toContain("grade_id");
  });

  it("refuses is_success, which is generated from send_count", async () => {
    const res = await request(app)
      .patch("/api/v1/attempts/1")
      .set("Authorization", TOKEN)
      .send({ is_success: true });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("send_count");
  });
});

describe("rate limiting", () => {
  // Regression: the exemption compared req.path against "/health", but this
  // limiter is mounted at the app root, so req.path is "/api/v1/health" and the
  // skip silently never fired — Render's continuous health poll counted against
  // a shared IP bucket.
  it("exempts the health check from the global limiter", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit"]).toBeUndefined();
  });

  it("still counts an ordinary request", async () => {
    const res = await request(app).get("/api/v1/health/../sessions");
    expect(res.headers["ratelimit"]).toMatch(/limit=300/);
  });
});

describe("POST /share-events", () => {
  // The share feature's only server-side footprint. Cards are drawn in the
  // browser, so this row is the one thing that says which template and format
  // anyone uses — and it must stay a counter: these tests pin the body to the
  // three enum fields and nothing else.
  const valid = { template: "climb", format: "video", outcome: "shared" };

  it("records a valid event", async () => {
    const { query } = await import("./db/pool");
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ share_event_id: 7, user_id: 1, ...valid, created_at: "2026-08-21T00:00:00Z" }],
      rowCount: 1,
    } as never);

    const res = await request(app)
      .post("/api/v1/share-events")
      .set("Authorization", TOKEN)
      .send(valid);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ share_event_id: 7, ...valid });
    // The user comes from the token, never from the body.
    expect(vi.mocked(query).mock.lastCall?.[1]).toEqual([1, "climb", "video", "shared"]);
  });

  it.each([
    ["template", { ...valid, template: "stats" }],
    ["format", { ...valid, format: "gif" }],
    ["outcome", { ...valid, outcome: "posted" }],
    ["template", { format: "image", outcome: "saved" }],
  ])("rejects a bad or missing %s", async (field, body) => {
    const res = await request(app)
      .post("/api/v1/share-events")
      .set("Authorization", TOKEN)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain(field);
  });

  it("is write-only", async () => {
    const res = await request(app)
      .get("/api/v1/share-events")
      .set("Authorization", TOKEN);
    expect(res.status).toBe(404);
  });
});

describe("AI generation quota", () => {
  // The limit on paid model calls counts rows already generated rather than
  // keeping a tally in memory, so that it survives a restart and holds across
  // every instance. These assert the two branches of that count.
  const quotaUsed = async (used: number) => {
    const { query } = await import("./db/pool");
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ used: String(used) }],
      rowCount: 1,
    } as never);
  };

  it.each(["performances", "trainings"])(
    "refuses POST /%s once the hourly allowance is spent",
    async (resource) => {
      await quotaUsed(10);

      const res = await request(app)
        .post(`/api/v1/${resource}`)
        .set("Authorization", TOKEN)
        .send({ period_type: "monthly" });

      expect(res.status).toBe(429);
      expect(res.body.error.message).toMatch(/last hour/);
    },
  );

  it("lets a request through while the allowance remains", async () => {
    await quotaUsed(9);

    const res = await request(app)
      .post("/api/v1/performances")
      .set("Authorization", TOKEN)
      .send({ period_type: "monthly" });

    // Past the quota gate, into the controller — which fails for its own
    // reasons against a mocked database. Anything but 429 proves the point.
    expect(res.status).not.toBe(429);
  });
});

describe("request validation", () => {
  it("reports malformed JSON as a 400, not a 500", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("Authorization", TOKEN)
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Malformed JSON in request body");
  });

  it("rejects an id that is not plain digits", async () => {
    // Number("1e3") is 1000, so this used to be a working alias for attempt
    // 1000.
    const res = await request(app)
      .get("/api/v1/attempts/1e3")
      .set("Authorization", TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Invalid id");
  });

  it("rejects a bad month on /stats", async () => {
    const res = await request(app)
      .get("/api/v1/stats?month=2026-8")
      .set("Authorization", TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("YYYY-MM");
  });
});

describe("session list paging", () => {
  it.each([
    ["limit", "1e3"],
    ["limit", "-5"],
    ["limit", "101"],
    ["offset", "-1"],
    ["offset", "1e9"],
    ["grade_id", "abc"],
    ["from", "07-07-2026"],
  ])("rejects %s=%s", async (param, value) => {
    const res = await request(app)
      .get(`/api/v1/sessions?${param}=${encodeURIComponent(value)}`)
      .set("Authorization", TOKEN);

    expect(res.status).toBe(400);
  });

  it("accepts offset=0, which the id pattern would otherwise reject", async () => {
    const res = await request(app)
      .get("/api/v1/sessions?offset=0&limit=20")
      .set("Authorization", TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ limit: 20, offset: 0 });
  });
});

describe("report browsing filters", () => {
  it.each(["performances", "trainings"])(
    "GET /%s rejects a non-boolean is_pinned",
    async (resource) => {
      const res = await request(app)
        .get(`/api/v1/${resource}?is_pinned=yes`)
        .set("Authorization", TOKEN);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("is_pinned");
    },
  );

  it.each(["performances", "trainings"])(
    "GET /%s reports how many matched",
    async (resource) => {
      const res = await request(app)
        .get(`/api/v1/${resource}?is_pinned=true&limit=5&offset=0`)
        .set("Authorization", TOKEN);

      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ limit: 5, offset: 0 });
      expect(res.body.meta.total).toBeDefined();
    },
  );
});

describe("POST /sessions/:id/attempts", () => {
  it("validates the climb the same way a nested one is validated", async () => {
    const res = await request(app)
      .post("/api/v1/sessions/1/attempts")
      .set("Authorization", TOKEN)
      .send({ grade_id: 3, attempt_count: 2, send_count: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cannot exceed tries/);
  });

  it("requires a grade", async () => {
    const res = await request(app)
      .post("/api/v1/sessions/1/attempts")
      .set("Authorization", TOKEN)
      .send({ route_name: "Yellow slab" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("grade_id");
  });

  it("needs a token", async () => {
    const res = await request(app).post("/api/v1/sessions/1/attempts").send({});
    expect(res.status).toBe(401);
  });
});

describe("frozen AI snapshots", () => {
  it.each([
    ["performances", "performance_report"],
    ["performances", "analysis_data"],
    ["trainings", "training_report"],
    ["trainings", "analysis_data"],
  ])("PATCH /%s refuses to edit %s", async (resource, field) => {
    const res = await request(app)
      .patch(`/api/v1/${resource}/1`)
      .set("Authorization", TOKEN)
      .send({ [field]: "rewritten" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain(field);
  });
});

describe("PATCH /users/me", () => {
  it("refuses to change the fields that belong to Supabase Auth", async () => {
    for (const field of ["email", "status", "auth_user_id", "user_id"]) {
      const res = await request(app)
        .patch("/api/v1/users/me")
        .set("Authorization", TOKEN)
        .send({ [field]: "x" });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(field);
    }
  });
});
