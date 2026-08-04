import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type SessionType from "../types/SessionType";
import type { AttemptInSession } from "../types/SessionType";
import Card from "../components/Card";

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
      <h1>Dashboard Page</h1>
      {isSessionsLoading && <p>Loading stats...</p>}
      {isSessionsError && (
        <p className="text-red-500">Failed to load sessions.</p>
      )}

      {!isSessionsLoading && !isSessionsError && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 border rounded-lg shadow-sm bg-card">
            <h3 className="text-sm font-medium text-muted-foreground">
              SESSIONS THIS MONTH
            </h3>
            <p className="text-3xl font-bold mt-2">{currentMonthCount}</p>
          </Card>

          <Card className="p-4 border rounded-lg shadow-sm bg-card">
            <h3 className="text-sm font-medium text-muted-foreground">
              HIGHEST GRADE
            </h3>
            {/* <p className="text-3xl font-bold mt-2">{highestGrade}</p> */}
          </Card>

          <Card className="p-4 border rounded-lg shadow-sm bg-card">
            <h3 className="text-sm font-medium text-muted-foreground">
              TOTAL ATTEMPTS
            </h3>
            <p className="text-3xl font-bold mt-2">{totalAttemptsCount}</p>
          </Card>
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
