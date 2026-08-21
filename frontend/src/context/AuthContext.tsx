import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { clearAllSessionDrafts } from "../lib/sessionDraft";
import { currentLocale } from "../i18n";
import { AuthContext, type AuthContextValue } from "../hooks/useAuth";
import type User from "../types/UserType";

/**
 * Where the confirmation link returns the user. Deriving it from the current
 * origin means it follows localhost in development and the real domain once
 * deployed, with no code change — but the URL must still be allow-listed under
 * Supabase → Authentication → URL Configuration.
 */
const emailRedirectTo = (): string => window.location.origin;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Drop all cached server data whenever the user signs out — whether via
      // the sign-out button or an expired session — so an account signing in
      // afterwards can never see the previous account's data. The unsaved log
      // draft goes with it, for the same reason: it is server-shaped data that
      // simply has not been sent yet.
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        clearAllSessionDrafts();
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

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
        if (cancelled) return;
        setLoaded({ userId, profile: data, error: null });

        // Keep the account's language matching the one on screen.
        //
        // The interface picks its language from the browser, but AI reports are
        // written on the server from users.locale — so a climber whose phone is
        // in Japanese used to read a Japanese app and get English coaching, and
        // the only way to reconcile them was to visit Profile and press a
        // button. Whatever they are actually looking at wins.
        //
        // Best effort, and deliberately not awaited: a language that failed to
        // save is worth far less than a profile load that failed because of it.
        const shown = currentLocale();
        if (data.locale !== shown) {
          void api("/users/me", {
            method: "PATCH",
            body: JSON.stringify({ locale: shown }),
          }).catch(() => undefined);
        }
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password, // first/last name ride along in user_metadata; the backend reads them
        // from the JWT to create the profile row. No extra API call needed.
        options: {
          // The language rides along too. This is the only point where it can
          // reach the account before the account exists, and it is what the AI
          // coach writes its reports in — the interface reads the browser, but
          // the reports are generated on the server.
          data: {
            first_name: firstName,
            last_name: lastName,
            locale: currentLocale(),
          },
          emailRedirectTo: emailRedirectTo(),
        },
      });
      if (error) {
        return { error: error.message, needsEmailConfirmation: false };
      }
      // A session here means confirmation is switched off and the user is
      // already signed in; its absence means Supabase sent a link instead.
      return { error: null, needsEmailConfirmation: data.session === null };
    },
    async signIn({ email, password }) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        return {
          error: error.message,
          needsEmailConfirmation: error.code === "email_not_confirmed",
        };
      }
      return { error: null, needsEmailConfirmation: false };
    },
    async resendConfirmation(email) {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      return { error: error?.message ?? null };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
