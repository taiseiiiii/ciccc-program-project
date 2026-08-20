import { Suspense, lazy } from "react";
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
const Profile = lazy(() => import("../pages/Profile"));

/** Shown while a screen's chunk arrives. */
const ScreenFallback = () => (
  <p className="text-on-surface-variant animate-pulse">Loading...</p>
);

/**
 * Route guards.
 *
 * `loading` is the initial `getSession()` call. Rendering null through it, as
 * before, meant a blank screen on every cold start; a spinner at least says
 * the app is doing something.
 */
const AuthPending = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <p className="text-on-surface-variant animate-pulse">Loading ClimbLog...</p>
  </div>
);

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
const NotFound = () => (
  <Card className="max-w-md mx-auto mt-10 flex flex-col gap-3">
    <h1 className="text-headline-sm font-bold text-on-surface">
      That page does not exist
    </h1>
    <p className="text-on-surface-variant">
      The link may be out of date, or there may be a typo in the address.
    </p>
    <Link to="/" className="text-primary font-medium hover:underline">
      Back to the dashboard
    </Link>
  </Card>
);

const AppRoutes = () => {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Routes>
        <Route element={<RedirectIfAuthed />}>
          <Route path="/auth" element={<Auth />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="log-session" element={<LogSession />} />
            <Route path="sessions" element={<Sessions />} />
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
