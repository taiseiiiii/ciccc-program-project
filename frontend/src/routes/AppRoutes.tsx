import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Dashboard from "../pages/Dashboard";
import LogSession from "../pages/LogSession";
import Progress from "../pages/Progress";
import AICoach from "../pages/AICoach";
import AppLayout from "../layouts/AppLayout";
import Profile from "../pages/Profile";
import AuthLayout from "../layouts/AuthLayout";

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
          <Route path="progress" element={<Progress />} />
          <Route path="ai-coach" element={<AICoach />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default AppRoutes;
