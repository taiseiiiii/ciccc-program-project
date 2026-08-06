import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type SessionType from "../types/SessionType";
import type { AttemptInSession } from "../types/SessionType";
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

// Mock data for Recarts
const visitData = [
  { month: "Apr", visits: 8 },
  { month: "May", visits: 12 },
  { month: "Jun", visits: 10 },
  { month: "Jul", visits: 15 },
  { month: "Aug", visits: 14 },
];

const progressData = [
  { month: "Apr", maxGrade: 3, label: "V3" },
  { month: "May", maxGrade: 4, label: "V4" },
  { month: "Jun", maxGrade: 4, label: "V4" },
  { month: "Jul", maxGrade: 5, label: "V5" },
  { month: "Aug", maxGrade: 5, label: "V5" },
];

const successRateData = [
  { name: "Success", value: 68, color: "var(--color-primary)" },
  { name: "Failed", value: 32, color: "var(--color-secondary-container)" },
];

const Dashboard = () => {
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
    queryFn: () => api<{ data: SessionType[] }>("/sessions?include=attempts"),
  });

  const {
    data: attemptsData,
    isPending: isAttemptsLoading,
    isError: isAttemptsError,
  } = useQuery({
    queryKey: ["attempts"],
    queryFn: () => api<{ data: AttemptInSession[] }>("/attempts"),
  });

  const sessions = sessionsData?.data || [];
  const attempts = attemptsData?.data || [];

  // Sessions this month
  const currentYearMonth = new Date().toLocaleDateString("sv-SE").slice(0, 7);
  const currentMonthSessions = sessions.filter((session) =>
    session.visit_date?.startsWith(currentYearMonth),
  );
  const currentMonthCount = currentMonthSessions.length;

  // Highest grade
  // const successfulAttempts = attempts.filter((a) => a.is_success === true);
  // const successfulAttempts = sessions.flatMap((session) =>
  //   (session.attempts || []).filter((attempt) => attempt?.is_success === true),
  // );

  // let highestGrade = "-";
  // if (successfulAttempts.length > 0) {
  //   const getGradeNumber = (attempt: AttemptInSession) => {
  //     // route.grade.grade_name や grade_name など、多層的にフォールバック取得
  //     const rawGradeName =
  //       // attempt.route?.grade?.grade_name ||
  //       attempt.grade_name || "";
  //     const numericString = rawGradeName.toString().replace("V", "");
  //     // const numericString = String(rawGradeName).replace(/[^0-9]/g, "");
  //     return Number(numericString) || 0;
  //   };

  //   const gradeNumbers = successfulAttempts.map(getGradeNumber);
  //   const maxGradeNum = Math.max(...gradeNumbers);

  //   if (maxGradeNum > 0) {
  //     highestGrade = `V${maxGradeNum}`;
  //   }
  // }
  // -------------------------------------------------------
  // if (successfulAttempts.length > 0) {
  //   const getGradeNumber = (attempt: any) => {
  //     const rawGradeName =
  //       attempt?.grade?.grade_name || attempt?.grade_name || "";
  //     const numericString = rawGradeName.toString().replace("V", "");
  //     return Number(numericString) || 0;
  //   };

  //   const gradeNumbers = successfulAttempts.map(getGradeNumber);
  //   const maxGradeNum = Math.max(...gradeNumbers);

  //   if (maxGradeNum > 0) {
  //     highestGrade = `V${maxGradeNum}`;
  //   }
  // }

  // Total attempts
  const totalAttemptsCount = attempts.length;
  // const totalAttemptsCount = sessions.reduce(
  //   (acc, session) => acc + (session.attempts?.length || 0),
  //   0,
  // );

  const isLoading = isSessionsLoading || isAttemptsLoading;
  const isError = isSessionsError || isAttemptsError;

  return (
    <div>
      {isSessionsLoading && <p>Loading stats...</p>}
      {isSessionsError && (
        <p className="text-red-500">Failed to load sessions.</p>
      )}

      {!isSessionsLoading && !isSessionsError && (
        <div>
          <div className="mt-3">
            <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
              Welcome back, Suzu!
            </h1>
            <p>You're on track for your best month yet.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 mb-4">
            <Card className="p-4 bg-card flex flex-col justify-center">
              <h3 className="text-sm font-medium text-muted-foreground">
                SESSIONS THIS MONTH
              </h3>
              <div className="gap-3 flex flex-row items-center justify-baseline">
                <p className="text-3xl font-bold mt-2">{currentMonthCount}</p>
                <p className="text-error">- 5 vs last month</p>
              </div>
            </Card>

            <Card className="p-4 bg-card flex flex-col justify-center">
              <h3 className="text-sm font-medium text-muted-foreground">
                HIGHEST GRADE
              </h3>
              {/* <p className="text-3xl font-bold mt-2">{highestGrade}</p> */}
            </Card>

            <Card className="p-4 bg-card flex flex-col justify-center">
              <h3 className="text-sm font-medium text-muted-foreground">
                TOTAL ATTEMPTS
              </h3>
              <p className="text-3xl font-bold mt-2">{totalAttemptsCount}</p>
            </Card>

            <div className="p-4 bg-card rounded-xl shadow-sm bg-primary-container flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-primary-container">
                AI COACH
              </h3>
              <p className="text-3xl font-bold mt-2 text-on-primary">
                Focus on slab
              </p>
              <p className="text-body-sm mt-1 text-on-primary/90">
                Slab success is 15% lower. Focus on footwork.
              </p>
              <Button
                // to="/AICoach"
                variant="secondary"
                className="mt-4 bg-primary-container text-primary hover:opacity-90 font-medium w-full"
              >
                View Plan
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-4">
            <Card className="p-4 bg-card flex flex-col justify-center">
              <h3 className="text-sm font-medium text-muted-foreground">
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

            <Card className="p-4 bg-card flex flex-col justify-center">
              <h3 className="text-sm font-medium text-muted-foreground">
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
                      domain={[0, 8]}
                      tickFormatter={(value) => `V${value}`}
                    />
                    <Tooltip
                      formatter={(value: number) => [`V${value}`, "Max Grade"]}
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

            <Card className="p-4 bg-card flex flex-col justify-center">
              <h3 className="text-sm font-medium text-muted-foreground">
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
                      {successRateData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, "Rate"]}
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
                    68%
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
              <Card className="p-4 flex flex-row items-center justify-between">
                <div className="flex flex-row gap-4">
                  <p>2026-08-2</p>
                  <p className="font-bold">Progression</p>
                </div>
                <Button variant="secondary">View</Button>
              </Card>
            </div>
            <div className="flex flex-col gap-3 mt-3">
              <Card className="p-4 flex flex-row items-center justify-between">
                <div className="flex flex-row gap-4">
                  <p>2026-07-31</p>
                  <p className="font-bold">The Hive</p>
                </div>
                <Button variant="secondary">View</Button>
              </Card>
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
