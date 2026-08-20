import { describe, expect, it } from "vitest";
import { databaseHost, isLocalHost, resolveSsl } from "./ssl";

/**
 * TLS decisions, so they are a test rather than a thing someone reasons about
 * at deploy time. The case that matters most is the default: a hosted database
 * must get *verified* TLS without anyone remembering to ask for it, because the
 * failure mode of getting that wrong is silent.
 */

describe("databaseHost", () => {
  it("pulls the host out of a connection string", () => {
    expect(databaseHost("postgres://u:p@db.abc.supabase.co:5432/postgres")).toBe(
      "db.abc.supabase.co",
    );
  });

  it("strips the brackets Node keeps around an IPv6 host", () => {
    expect(databaseHost("postgres://u:p@[::1]:5432/climb_app")).toBe("::1");
  });

  it("returns empty string for something that is not a URL", () => {
    expect(databaseHost("not a url")).toBe("");
  });
});

describe("isLocalHost", () => {
  it("recognises the loopback names", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", ""]) {
      expect(isLocalHost(host)).toBe(true);
    }
  });

  it("does not treat a hosted database as local", () => {
    expect(isLocalHost("db.abc.supabase.co")).toBe(false);
  });
});

describe("resolveSsl", () => {
  const LOCAL = "postgres://postgres:postgres@localhost:5432/climb_app";
  const HOSTED = "postgres://u:p@db.abc.supabase.co:5432/postgres";

  it("defaults to no TLS for localhost", () => {
    expect(resolveSsl(LOCAL, {})).toBe(false);
  });

  it("defaults to VERIFIED TLS for a hosted database", () => {
    // The important one. Getting this wrong is a downgrade nobody would notice.
    expect(resolveSsl(HOSTED, {})).toEqual({ rejectUnauthorized: true });
  });

  it("honours an explicit mode over the host", () => {
    expect(resolveSsl(HOSTED, { DATABASE_SSL: "disable" })).toBe(false);
    expect(resolveSsl(LOCAL, { DATABASE_SSL: "require" })).toEqual({
      rejectUnauthorized: true,
    });
    expect(resolveSsl(HOSTED, { DATABASE_SSL: "no-verify" })).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("is case- and whitespace-insensitive about the mode", () => {
    expect(resolveSsl(HOSTED, { DATABASE_SSL: "  DISABLE " })).toBe(false);
  });

  it("throws on an unknown mode rather than guessing", () => {
    expect(() => resolveSsl(HOSTED, { DATABASE_SSL: "yes" })).toThrow(
      /Invalid DATABASE_SSL/,
    );
  });

  it("accepts an inline PEM certificate", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";
    expect(resolveSsl(HOSTED, { DATABASE_CA_CERT: pem })).toEqual({
      rejectUnauthorized: true,
      ca: pem,
    });
  });

  it("un-escapes \\n in a single-line PEM, which is all some hosts can store", () => {
    const escaped = "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----";
    const result = resolveSsl(HOSTED, { DATABASE_CA_CERT: escaped });
    expect(result).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
    });
  });

  it("explains itself when DATABASE_CA_CERT points at a missing file", () => {
    expect(() =>
      resolveSsl(HOSTED, { DATABASE_CA_CERT: "./certs/does-not-exist.crt" }),
    ).toThrow(/could not be read/);
  });

  it("does not read the CA at all for a local connection", () => {
    // Loaded lazily on purpose: a teammate who never downloaded the Supabase
    // certificate should still be able to run against localhost.
    expect(
      resolveSsl(LOCAL, { DATABASE_CA_CERT: "./certs/does-not-exist.crt" }),
    ).toBe(false);
  });
});
