import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Dashboard from "../pages/Dashboard";
import LogSession from "../pages/LogSession";
import AICoach from "../pages/AICoach";
import AppLayout from "../layouts/AppLayout";
import Profile from "../pages/Profile";
import AuthLayout from "../layouts/AuthLayout";

// Progress is the largest screen in the app, so it is loaded on demand. Note
// that this does not keep recharts out of the initial download: Dashboard is
// eagerly imported above and pulls the same charting library in with it.
const Progress = lazy(() => import("../pages/Progress"));

// Injuries is loaded on demand for a different reason: most climbers, most of
// the time, never open it.
const Injuries = lazy(() => import("../pages/Injuries"));

const RequireAuth = () => {
  const { session, loading } = useAuth();
  if (loading) return null;

  if (session) {
    return <Outlet />;
  } else {
    return <Navigate to={"/auth"} replace />;
  }
};

const RedirectIfAuthed = () => {
  const { session, loading } = useAuth();
  if (loading) return null;

  if (session) {
    return <Navigate to={"/"} replace />;
  } else {
    return <Outlet />;
  }
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route element={<RedirectIfAuthed />}>
        <Route path="/auth" element={<AuthLayout />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="log-session" element={<LogSession />} />
          <Route
            path="progress"
            element={
              <Suspense
                fallback={
                  <p className="text-on-surface-variant">
                    Loading your analytics...
                  </p>
                }
              >
                <Progress />
              </Suspense>
            }
          />
          <Route path="ai-coach" element={<AICoach />} />
          <Route
            path="injuries"
            element={
              <Suspense
                fallback={
                  <p className="text-on-surface-variant">Loading...</p>
                }
              >
                <Injuries />
              </Suspense>
            }
          />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default AppRoutes;
