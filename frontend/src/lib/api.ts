import { supabase } from "./supabase";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

/**
 * Generous, because generating an AI report is one synchronous round trip that
 * regularly takes 10–30s. Short enough that a dead server fails instead of
 * spinning forever.
 */
const REQUEST_TIMEOUT_MS = 70_000;

/**
 * An error from the API, carrying the status so callers can branch on it.
 *
 * Everything used to arrive as a bare `Error` with a message, which meant a
 * component could show the text but never tell "you are rate limited" from
 * "that route is gone" from "the server is down".
 */
export class ApiError extends Error {
  readonly status: number;
  /** Present on 500s. Matches the server's log line — worth quoting in a bug report. */
  readonly requestId?: string;

  constructor(status: number, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }

  /** Retrying will not help: the request itself is the problem. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/** A network failure, a timeout, or anything else that never reached the API. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * The session is gone — sign out so the route guards move the user to /auth
 * instead of leaving them on a screen that will never load.
 *
 * Only after a refresh has been tried and the server still refused: the
 * Supabase client rotates access tokens on its own, so a single 401 is more
 * often a token that expired mid-flight than an account that is actually
 * signed out, and dropping someone's session over that would be worse than the
 * failed request.
 */
async function handleExpiredSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession();
  if (!error && data.session) return true;
  await supabase.auth.signOut();
  return false;
}

async function send(path: string, options: RequestInit, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    return await fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new NetworkError("The server took too long to answer — try again");
    }
    throw new NetworkError("Could not reach the server — check your connection");
  }
}

export const api = async <T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  let res = await send(path, options, data.session?.access_token);

  // One retry, and only for an expired token. See handleExpiredSession.
  if (res.status === 401 && data.session) {
    if (await handleExpiredSession()) {
      const { data: refreshed } = await supabase.auth.getSession();
      res = await send(path, options, refreshed.session?.access_token);
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; request_id?: string };
    };
    throw new ApiError(
      res.status,
      body.error?.message ?? `Request failed (${res.status})`,
      body.error?.request_id,
    );
  }

  if (res.status === 204) {
    return null as T;
  }
  return res.json() as Promise<T>;
};
