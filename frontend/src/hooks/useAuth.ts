import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type User from "../types/UserType";

/**
 * Outcome of a sign-up or sign-in attempt.
 *
 * `needsEmailConfirmation` is its own flag rather than something the caller has
 * to infer: with Supabase's "Confirm email" setting on, signing up succeeds but
 * produces no session, and signing in fails outright, until the emailed link is
 * clicked. Both cases should lead the user to the same "check your inbox"
 * screen, so both report it here.
 */
export interface AuthResult {
  error: string | null;
  needsEmailConfirmation: boolean;
}

export interface AuthContextValue {
  session: Session | null;
  loading: boolean; // true until the initial getSession() resolves
  /** App-side profile from the API. null until it loads, or if the API is down. */
  profile: User | null;
  /** Set when /users/me fails — the session is still valid, the API is not. */
  profileError: string | null;
  signUp: (args: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<AuthResult>;
  signIn: (args: { email: string; password: string }) => Promise<AuthResult>;
  /** Re-send the sign-up confirmation link, for when the first one is lost. */
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

/**
 * The context object and hook live here, apart from AuthProvider
 * (context/AuthContext.tsx), so that file exports only a component and Fast
 * Refresh keeps working on it (react-refresh/only-export-components).
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
