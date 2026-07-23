import { Routes, Route } from "react-router-dom";
import Dashboard from "../pages/Dashboard";
import LogSession from "../pages/LogSession";
import Progress from "../pages/Progress";
import AICoach from "../pages/AICoach";
import AppLayout from "../layouts/AppLayout";
import Profile from "../pages/Profile";
import AuthLayout from "../layouts/AuthLayout";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/auth" element={<AuthLayout />}></Route>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="log-session" element={<LogSession />} />
        <Route path="progress" element={<Progress />} />
        <Route path="ai-coach" element={<AICoach />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
