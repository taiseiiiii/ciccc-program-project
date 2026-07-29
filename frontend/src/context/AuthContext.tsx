import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import type User from "../types/UserType";

interface AuthContextValue {
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
  }) => Promise<{ error: string | null }>;
  signIn: (args: {
    email: string;
    password: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Tagged with the user it was fetched for, so signing out or switching
  // accounts can never show the previous user's profile.
  const [loaded, setLoaded] = useState<{
    userId: string;
    profile: User | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the app-side profile once we have a session. This is also what creates
  // the row: the backend provisions it from the JWT on the first authenticated
  // request, so without this call a signed-up user has no profile server-side.
  // Keyed on the user id, not the session object, which is replaced on every
  // token refresh.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api<{ data: User }>("/users/me")
      .then(({ data }) => {
        if (!cancelled) setLoaded({ userId, profile: data, error: null });
      })
      .catch((err: unknown) => {
        // Deliberately non-fatal: the user stays signed in and the route guards
        // keep working even when the API server is unreachable.
        if (!cancelled)
          setLoaded({
            userId,
            profile: null,
            error:
              err instanceof Error ? err.message : "Failed to load profile",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const current = userId && loaded?.userId === userId ? loaded : null;

  const value: AuthContextValue = {
    session,
    loading,
    profile: current?.profile ?? null,
    profileError: current?.error ?? null,
    async signUp({ email, password, firstName, lastName }) {
      const { error } = await supabase.auth.signUp({
        email,
        password, // first/last name ride along in user_metadata; the backend reads them
        // from the JWT to create the profile row. No extra API call needed.
        options: { data: { first_name: firstName, last_name: lastName } },
      });
      return { error: error?.message ?? null };
    },
    async signIn({ email, password }) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message ?? null };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
