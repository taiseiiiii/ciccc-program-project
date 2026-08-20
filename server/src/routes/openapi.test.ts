import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import type { Router } from "express";

/**
 * The spec and the router have to agree.
 *
 * `docs/openapi.yaml` is not generated — it is written by hand, served at
 * /api/v1/docs, and is what anyone integrating against this API reads. So the
 * failure mode is silent: an endpoint is added, renamed or removed and the spec
 * keeps describing the old shape, which is worse than having no spec at all
 * because people believe it.
 *
 * This walks the Express router's own stack and compares it, path by path and
 * verb by verb, with what the YAML claims. It is the reason the docs can be
 * trusted without anyone remembering to check them.
 */

vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/climb_app_test");
vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");

vi.mock("../db/pool", () => ({
  pool: { connect: vi.fn(), end: vi.fn(), on: vi.fn(), query: vi.fn() },
  query: vi.fn(),
  pingDatabase: vi.fn(),
}));

/** Express's internal router shape, as much of it as this test walks. */
interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  regexp?: RegExp;
  handle?: { stack?: RouteLayer[] };
}

/**
 * Turn Express's mount regexp back into the path it was mounted at.
 * `/^\/sessions\/?(?=\/|$)/i` -> `/sessions`
 */
function mountPath(regexp: RegExp | undefined): string {
  if (!regexp) return "";
  const match = /^\^\\\/((?:[\w\-\\/]|\\.)*?)\\\/\?/.exec(regexp.source);
  if (!match?.[1]) return "";
  return `/${match[1].replace(/\\/g, "")}`;
}

/** Every "METHOD /path" the router actually serves, in OpenAPI path syntax. */
function collectRoutes(router: Router): Set<string> {
  const found = new Set<string>();

  const walk = (layers: RouteLayer[], prefix: string) => {
    for (const layer of layers) {
      if (layer.route) {
        // Express writes params as `:id`; OpenAPI writes them as `{id}`.
        const raw = `${prefix}${layer.route.path}`.replace(/:(\w+)/g, "{$1}");
        const cleaned = raw.length > 1 ? raw.replace(/\/$/, "") : raw;
        for (const method of Object.keys(layer.route.methods)) {
          found.add(`${method.toUpperCase()} ${cleaned}`);
        }
        continue;
      }
      if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPath(layer.regexp));
      }
    }
  };

  walk((router as unknown as { stack: RouteLayer[] }).stack, "");
  return found;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Every "METHOD /path" the YAML documents. */
function collectSpec(spec: {
  paths: Record<string, Record<string, unknown>>;
}): Set<string> {
  const found = new Set<string>();
  for (const [pathKey, operations] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      if (operations[method]) found.add(`${method.toUpperCase()} ${pathKey}`);
    }
  }
  return found;
}

describe("openapi.yaml matches the router", () => {
  it("documents every route, and documents no route that does not exist", async () => {
    const { default: apiRoutes } = await import("./index");
    const spec = parseYaml(
      readFileSync(path.join(__dirname, "..", "..", "docs", "openapi.yaml"), "utf8"),
    );

    const actual = collectRoutes(apiRoutes);
    const documented = collectSpec(spec);

    // Sorted arrays rather than set difference, so a failure prints the
    // offending endpoints instead of "expected true to be false".
    const undocumented = [...actual].filter((r) => !documented.has(r)).sort();
    const phantom = [...documented].filter((r) => !actual.has(r)).sort();

    expect({ undocumented, phantom }).toEqual({ undocumented: [], phantom: [] });
  });

  it("found a plausible number of routes — the walker itself still works", () => {
    // Guards against the regexp above quietly matching nothing after an Express
    // upgrade, which would make the test pass by comparing two empty sets.
    return import("./index").then(({ default: apiRoutes }) => {
      expect(collectRoutes(apiRoutes).size).toBeGreaterThan(25);
    });
  });

  it("gives every documented operation a unique operationId", async () => {
    const spec = parseYaml(
      readFileSync(path.join(__dirname, "..", "..", "docs", "openapi.yaml"), "utf8"),
    ) as { paths: Record<string, Record<string, { operationId?: string }>> };

    const ids: string[] = [];
    for (const operations of Object.values(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const operation = operations[method];
        if (operation) {
          expect(operation.operationId, `${method} is missing an operationId`).toBeTruthy();
          ids.push(operation.operationId!);
        }
      }
    }

    expect(ids.length).toBe(new Set(ids).size);
  });
});
