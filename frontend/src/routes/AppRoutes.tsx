import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { Routes, Route, Navigate, Outlet, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AppLayout from "../layouts/AppLayout";
import Auth from "../pages/Auth";
import Card from "../components/Card";

/**
 * Every screen is loaded on demand.
 *
 * Dashboard used to be imported eagerly, which pulled recharts — the single
 * largest dependency in the app — into the entry chunk and defeated the point
 * of lazy-loading Progress at all. All four charting screens split now, so the
 * first paint (and the sign-in screen, which needs none of it) carries none of
 * it either.
 */
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Progress = lazy(() => import("../pages/Progress"));
const AICoach = lazy(() => import("../pages/AICoach"));
const Injuries = lazy(() => import("../pages/Injuries"));
const LogSession = lazy(() => import("../pages/LogSession"));
const Sessions = lazy(() => import("../pages/Sessions"));
const ImportCsv = lazy(() => import("../pages/ImportCsv"));
const Profile = lazy(() => import("../pages/Profile"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));

/** Shown while a screen's chunk arrives. */
const ScreenFallback = () => {
  const { t } = useTranslation();
  return (
    <p className="text-on-surface-variant animate-pulse">{t("state.loading")}</p>
  );
};

/**
 * Route guards.
 *
 * `loading` is the initial `getSession()` call. Rendering null through it, as
 * before, meant a blank screen on every cold start; a spinner at least says
 * the app is doing something.
 */
const AuthPending = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-on-surface-variant animate-pulse">
        {t("state.loading")}
      </p>
    </div>
  );
};

const RequireAuth = () => {
  const { session, loading } = useAuth();
  if (loading) return <AuthPending />;
  return session ? <Outlet /> : <Navigate to="/auth" replace />;
};

const RedirectIfAuthed = () => {
  const { session, loading } = useAuth();
  if (loading) return <AuthPending />;
  return session ? <Navigate to="/" replace /> : <Outlet />;
};

/** Anything the router does not recognise. Previously a blank page. */
const NotFound = () => {
  const { t } = useTranslation();
  return (
    <Card className="max-w-md mx-auto mt-10 flex flex-col gap-3">
      <h1 className="text-headline-sm font-bold text-on-surface">
        {t("notFound.title")}
      </h1>
      <p className="text-on-surface-variant">{t("notFound.body")}</p>
      <Link to="/" className="text-primary font-medium hover:underline">
        {t("notFound.back")}
      </Link>
    </Card>
  );
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Routes>
        <Route element={<RedirectIfAuthed />}>
          <Route path="/auth" element={<Auth />} />
        </Route>

        {/*
          Outside both guards on purpose. The recovery link arrives with a token
          that supabase-js turns into a session, so RequireAuth would bounce the
          user away before it was read and RedirectIfAuthed would bounce them
          into the app the moment it was — with the old password still set.
        */}
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="log-session" element={<LogSession />} />
            <Route path="sessions" element={<Sessions />} />
            {/* Reached from Profile — a one-off, not somewhere to navigate to. */}
            <Route path="import" element={<ImportCsv />} />
            <Route path="progress" element={<Progress />} />
            <Route path="ai-coach" element={<AICoach />} />
            <Route path="injuries" element={<Injuries />} />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
