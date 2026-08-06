import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type SessionType from "../types/SessionType";
import type { AttemptRecord } from "../types/AttemptType";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// The charts cover the current month and the previous four.
const MONTHS_SHOWN = 5;

/** Local YYYY-MM for the month `offset` months before the current one. */
const monthKey = (offset: number): string => {
  const d = new Date();
  d.setDate(1); // step back from the 1st so month arithmetic can't overflow
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleDateString("sv-SE").slice(0, 7);
};

/** "2026-08" -> "Aug". The T00:00:00 keeps parsing in the local timezone. */
const monthLabel = (key: string): string =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
  });

const Dashboard = () => {
  const { profile } = useAuth();

  // The server answers 503 when its database is down, so an error here means
  // "unreachable or unhealthy" — not only "not found".
  const { isPending: isHealthPending, isError: isHealthError } = useQuery({
    queryKey: ["health"],
    queryFn: () => api<{ status: string; db: "up" | "down" }>("/health"),
    // A liveness indicator should react quickly and keep itself current:
    // one retry instead of the default three, and a periodic refetch.
    retry: 1,
    refetchInterval: 30 * 1000,
  });

  const {
    data: sessionsData,
    isPending: isSessionsLoading,
    isError: isSessionsError,
  } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<{ data: SessionType[] }>("/sessions"),
  });

  const {
    data: attemptsData,
    isPending: isAttemptsLoading,
    isError: isAttemptsError,
  } = useQuery({
    queryKey: ["attempts"],
    queryFn: () => api<{ data: AttemptRecord[] }>("/attempts"),
  });

  const sessions = sessionsData?.data || [];
  const attempts = attemptsData?.data || [];

  const isLoading = isSessionsLoading || isAttemptsLoading;
  const isError = isSessionsError || isAttemptsError;

  // Sessions per month, keyed by YYYY-MM of the visit date
  const monthCounts = new Map<string, number>();
  for (const session of sessions) {
    const key = session.visit_date.slice(0, 7);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }
  const currentMonthCount = monthCounts.get(monthKey(0)) ?? 0;
  const lastMonthCount = monthCounts.get(monthKey(1)) ?? 0;
  const monthDelta = currentMonthCount - lastMonthCount;

  // Highest grade ever sent (successful attempts only)
  const successfulAttempts = attempts.filter((a) => a.is_success);
  const highestGrade =
    successfulAttempts.length > 0
      ? successfulAttempts.reduce((best, a) =>
          a.grade_level > best.grade_level ? a : best,
        ).grade_name
      : "-";

  // Total attempts
  const totalAttemptsCount = attempts.length;

  // Success rate across all attempts
  const successRate =
    attempts.length > 0
      ? Math.round((successfulAttempts.length / attempts.length) * 100)
      : 0;
  const successRateData = [
    { name: "Success", value: successRate, color: "var(--color-primary)" },
    {
      name: "Failed",
      value: 100 - successRate,
      color: "var(--color-secondary-container)",
    },
  ];

  // Chart rows for the last MONTHS_SHOWN months, oldest first
  const monthKeys = Array.from({ length: MONTHS_SHOWN }, (_, i) =>
    monthKey(MONTHS_SHOWN - 1 - i),
  );
  const visitData = monthKeys.map((key) => ({
    month: monthLabel(key),
    visits: monthCounts.get(key) ?? 0,
  }));

  // Best successful grade per month. Attempts carry no date of their own, so
  // each one takes the visit month of its parent session.
  const sessionMonth = new Map<number, string>();
  for (const session of sessions) {
    sessionMonth.set(session.session_id, session.visit_date.slice(0, 7));
  }
  const maxGradeByMonth = new Map<string, number>();
  for (const attempt of successfulAttempts) {
    const key = sessionMonth.get(attempt.session_id);
    if (!key) continue;
    maxGradeByMonth.set(
      key,
      Math.max(maxGradeByMonth.get(key) ?? attempt.grade_level, attempt.grade_level),
    );
  }
  // null (not 0) for months without a send, so the line shows a gap instead
  // of pretending the climber dropped to V0.
  const progressData = monthKeys.map((key) => ({
    month: monthLabel(key),
    maxGrade: maxGradeByMonth.get(key) ?? null,
  }));

  // Most recent gym visits (the server returns sessions newest first)
  const recentSessions = sessions.slice(0, 2);

  return (
    <div>
      {isLoading && <p>Loading stats...</p>}
      {isError && (
        <p className="text-error">Failed to load dashboard data.</p>
      )}

      {!isLoading && !isError && (
        <div>
          <div className="mt-3">
            <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
              Welcome back{profile?.first_name ? `, ${profile.first_name}` : ""}!
            </h1>
            <p>You're on track for your best month yet.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 mb-4">
            <Card className="p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-surface-variant">
                SESSIONS THIS MONTH
              </h3>
              <div className="gap-3 flex flex-row items-center">
                <p className="text-3xl font-bold mt-2">{currentMonthCount}</p>
                {monthDelta !== 0 && (
                  <p className={monthDelta > 0 ? "text-primary" : "text-error"}>
                    {monthDelta > 0 ? `+${monthDelta}` : monthDelta} vs last
                    month
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-surface-variant">
                HIGHEST GRADE
              </h3>
              <p className="text-3xl font-bold mt-2">{highestGrade}</p>
            </Card>

            <Card className="p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-surface-variant">
                TOTAL ATTEMPTS
              </h3>
              <p className="text-3xl font-bold mt-2">{totalAttemptsCount}</p>
            </Card>

            {/* Static placeholder until the AI coach backend exists. */}
            <div className="p-4 rounded-xl shadow-sm bg-primary-container flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-primary-container">
                AI COACH
              </h3>
              <p className="text-3xl font-bold mt-2 text-on-primary-container">
                Focus on slab
              </p>
              <p className="text-body-sm mt-1 text-on-primary-container/90">
                Slab success is 15% lower. Focus on footwork.
              </p>
              <Button
                variant="secondary"
                className="mt-4 bg-primary-container text-primary hover:opacity-90 font-medium w-full"
              >
                View Plan
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-4">
            <Card className="p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-surface-variant">
                MONTHLY VOLUME
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={visitData}>
                    <XAxis
                      dataKey="month"
                      stroke="var(--color-outline)"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="var(--color-outline)"
                      fontSize={12}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor:
                          "var(--color-surface-container-highest)",
                        borderColor: "var(--color-outline-variant)",
                        borderRadius: "8px",
                        color: "var(--color-on-surface)",
                      }}
                    />
                    <Bar
                      dataKey="visits"
                      fill="var(--color-primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-surface-variant">
                GRADE PROGRESS
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressData}>
                    <XAxis
                      dataKey="month"
                      stroke="var(--color-outline)"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="var(--color-outline)"
                      fontSize={12}
                      domain={[0, "auto"]}
                      allowDecimals={false}
                      tickFormatter={(value) => `V${value}`}
                    />
                    <Tooltip
                      formatter={(value) => [`V${Number(value)}`, "Max Grade"]}
                      contentStyle={{
                        backgroundColor:
                          "var(--color-surface-container-highest)",
                        borderColor: "var(--color-outline-variant)",
                        borderRadius: "8px",
                        color: "var(--color-on-surface)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="maxGrade"
                      stroke="var(--color-secondary)"
                      strokeWidth={3}
                      dot={{ fill: "var(--color-secondary)", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-surface-variant">
                SUCCESS RATE
              </h3>
              <div className="h-48 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={successRateData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {successRateData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${Number(value)}%`, "Rate"]}
                      contentStyle={{
                        backgroundColor:
                          "var(--color-surface-container-highest)",
                        borderColor: "var(--color-outline-variant)",
                        borderRadius: "8px",
                        color: "var(--color-on-surface)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-headline-sm font-bold text-on-surface">
                    {successRate}%
                  </span>
                  <span className="text-label-sm text-on-surface-variant">
                    Success
                  </span>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-6">
            <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
              Recent Activity
            </h1>
            <div className="flex flex-col gap-3 mt-3">
              {recentSessions.length === 0 && (
                <p className="text-on-surface-variant">
                  No sessions logged yet.
                </p>
              )}
              {recentSessions.map((session) => (
                <Card
                  key={session.session_id}
                  className="p-4 flex flex-row items-center justify-between"
                >
                  <div className="flex flex-row gap-4">
                    <p>{session.visit_date}</p>
                    <p className="font-bold">
                      {session.gym_name ?? "Climbing session"}
                    </p>
                  </div>
                  <Button variant="secondary">View</Button>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="font-bold mt-6">Server Connection</div>
      <div
        className={
          isHealthPending
            ? "text-amber-200"
            : isHealthError
              ? "text-amber-700"
              : "text-blue-600"
        }
      >
        {isHealthPending
          ? "connecting..."
          : isHealthError
            ? "Server connection failed"
            : "It's connected!"}
      </div>
    </div>
  );
};

export default Dashboard;
