import { readFileSync } from 'node:fs';

/** What `pg` accepts for its `ssl` option, narrowed to what we produce. */
export type SslConfig = false | { rejectUnauthorized: boolean; ca?: string };

// '' covers a unix-socket connection string, which has no host at all.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);

/** Hostname from a connection string, or '' if there isn't one. */
export function databaseHost(databaseUrl: string): string {
  try {
    // URL keeps IPv6 hosts in brackets; strip them so comparisons work.
    return new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

/** Whether a hostname refers to this machine (no TLS, safe to reset). */
export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

/**
 * Decide the TLS settings for a Postgres connection.
 *
 * Hosted Postgres (Supabase, Neon, RDS, ...) requires TLS; a local socket or
 * loopback connection does not and has no certificate to verify. Driven by
 * `DATABASE_SSL`:
 *
 *   auto       (default) off for localhost, verified TLS for every other host
 *   require    verified TLS — fails if the chain is not trusted
 *   no-verify  TLS with no certificate check. Encrypts, but cannot detect a
 *              man-in-the-middle, so keep it to local debugging
 *   disable    plaintext
 *
 * Set `DATABASE_CA_CERT` to a CA bundle path (Supabase offers one for download)
 * to keep verification on when the chain is not in the system trust store.
 */
/**
 * Read the CA bundle from `DATABASE_CA_CERT`, which may be either the PEM text
 * itself or a path to a .crt file. Inline PEM matters for hosting platforms
 * that expose environment variables but no writable filesystem; some of those
 * can only store single-line values, so escaped newlines are accepted too.
 */
function loadCa(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  if (raw.startsWith('-----BEGIN')) {
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  }
  try {
    return readFileSync(raw, 'utf8');
  } catch {
    throw new Error(
      `DATABASE_CA_CERT points at "${raw}", which could not be read. ` +
        'Give a path to the .crt file (relative paths resolve from the server/ directory) ' +
        'or paste the certificate itself.',
    );
  }
}

export function resolveSsl(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): SslConfig {
  const mode = (env.DATABASE_SSL ?? 'auto').trim().toLowerCase();

  // Loaded lazily: a local connection needs no CA, and should not fail just
  // because DATABASE_CA_CERT names a file this machine has not downloaded.
  const verified = (): SslConfig => {
    const ca = loadCa(env.DATABASE_CA_CERT);
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  };

  switch (mode) {
    case 'disable':
      return false;
    case 'no-verify':
      return { rejectUnauthorized: false };
    case 'require':
      return verified();
    case 'auto':
      return isLocalHost(databaseHost(databaseUrl)) ? false : verified();
    default:
      throw new Error(
        `Invalid DATABASE_SSL="${mode}". Expected one of: auto, require, no-verify, disable.`,
      );
  }
}
