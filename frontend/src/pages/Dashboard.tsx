import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type SessionType from "../types/SessionType";
import type { AttemptRecord } from "../types/AttemptType";
import type Performance from "../types/PerformanceType";
import type Injury from "../types/InjuryType";
import type Goal from "../types/GoalType";
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

// How many visits "Recent Activity" lists. Two was short enough that a week of
// climbing looked like most of it had failed to save.
const RECENT_SESSIONS_SHOWN = 5;

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

/**
 * Monday-anchored week key for a YYYY-MM-DD date, used for the streak.
 *
 * Weeks rather than days on purpose: a bouldering streak counted in days
 * breaks the moment someone takes the rest day their fingers need, which
 * punishes exactly the behaviour the app should encourage.
 */
const weekKey = (date: string): string => {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  // getDay() is 0 for Sunday; shift so Monday starts the week.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.toLocaleDateString("sv-SE");
};

/** The week key `weeksAgo` weeks before the current one. */
const weekKeyAgo = (weeksAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return weekKey(d.toLocaleDateString("sv-SE"));
};

/**
 * How many consecutive weeks up to now contain a session.
 *
 * The current week not having one yet does not break the run — it is only
 * Tuesday — so counting starts at whichever of this week or last week has
 * something in it.
 */
const climbingStreakWeeks = (sessions: SessionType[]): number => {
  const weeks = new Set(sessions.map((s) => weekKey(s.visit_date)));
  if (weeks.size === 0) return 0;

  let start = 0;
  if (!weeks.has(weekKeyAgo(0))) {
    if (!weeks.has(weekKeyAgo(1))) return 0;
    start = 1;
  }

  let streak = 0;
  for (let i = start; weeks.has(weekKeyAgo(i)); i += 1) streak += 1;
  return streak;
};

/** Whole days from today until `date`. Negative once the date has passed. */
const daysUntil = (date: string): number =>
  Math.ceil(
    (new Date(`${date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) /
      86_400_000,
  );

/** Sub-headline under the welcome, phrased to match the month-over-month delta. */
const paceMessage = (sessionCount: number, delta: number): string => {
  if (sessionCount === 0)
    return "Log your first session to start tracking your progress.";
  if (delta > 0) return "You're ahead of last month — keep it going!";
  if (delta < 0)
    return "You're behind last month's pace. Time to get back on the wall.";
  return "You're matching last month's pace.";
};

const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

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

  // The dashboard only ever shows the newest report, so it asks for one.
  const { data: performancesData } = useQuery({
    queryKey: ["performances", { limit: 1 }],
    queryFn: () => api<{ data: Performance[] }>("/performances?limit=1"),
  });

  const { data: injuriesData } = useQuery({
    queryKey: ["injuries", { status: "open" }],
    queryFn: () => api<{ data: Injury[] }>("/injuries"),
  });

  const { data: goalsData } = useQuery({
    queryKey: ["goals"],
    queryFn: () => api<{ data: Goal[] }>("/goals"),
  });

  const sessions = sessionsData?.data || [];
  const attempts = attemptsData?.data || [];
  const latestPerformance = performancesData?.data?.[0];
  const openInjuries = (injuriesData?.data ?? []).filter(
    (i) => i.status !== "healed",
  );

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

  const streakWeeks = climbingStreakWeeks(sessions);

  // Highest grade ever sent (routes that went at least once)
  const successfulAttempts = attempts.filter((a) => a.is_success);
  const highestGrade =
    successfulAttempts.length > 0
      ? successfulAttempts.reduce((best, a) =>
          a.grade_level > best.grade_level ? a : best,
        ).grade_name
      : "-";

  // A row is one route, so totals are sums of the counts on it. Counting rows
  // would report "routes touched", which is a different (smaller) number.
  const totalTriesCount = attempts.reduce((sum, a) => sum + a.attempt_count, 0);
  const totalSendsCount = attempts.reduce((sum, a) => sum + a.send_count, 0);

  const hasAttempts = totalTriesCount > 0;
  const successRate = hasAttempts
    ? Math.round((totalSendsCount / totalTriesCount) * 100)
    : 0;
  // With no attempts at all a Success/Failed split would render as a fully
  // "Failed" donut, so an empty ring stands in until there is data to split.
  const successRateData = hasAttempts
    ? [
        { name: "Success", value: successRate, color: "var(--color-primary)" },
        {
          name: "Failed",
          value: 100 - successRate,
          color: "var(--color-secondary-container)",
        },
      ]
    : [
        {
          name: "No data",
          value: 100,
          color: "var(--color-surface-container-highest)",
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

  // Best successful grade per month. Climbs carry no date of their own, so
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
      Math.max(
        maxGradeByMonth.get(key) ?? attempt.grade_level,
        attempt.grade_level,
      ),
    );
  }
  // null (not 0) for months without a send, so the line shows a gap instead
  // of pretending the climber dropped to V0.
  const progressData = monthKeys.map((key) => ({
    month: monthLabel(key),
    maxGrade: maxGradeByMonth.get(key) ?? null,
  }));

  // The goal with the nearest deadline — one line, not a list; Progress owns
  // the full picture.
  const nextGoal = (goalsData?.data ?? [])
    .filter((g) => !g.is_achieved && g.target_date)
    .sort((a, b) => a.target_date!.localeCompare(b.target_date!))[0];
  const daysToGoal = nextGoal?.target_date
    ? daysUntil(nextGoal.target_date)
    : null;

  // Most recent gym visits (the server returns sessions newest first)
  const recentSessions = sessions.slice(0, RECENT_SESSIONS_SHOWN);

  const coachSummary =
    latestPerformance?.analysis_data?.summary ??
    latestPerformance?.analysis_data?.headline;

  return (
    <div>
      {isLoading && <p>Loading stats...</p>}
      {isError && <p className="text-error">Failed to load dashboard data.</p>}

      {!isLoading && !isError && (
        <div>
          {/*
            Injuries lead. Everything else on this page encourages more
            climbing, which is the wrong message to open with while something
            is still healing.
          */}
          {openInjuries.length > 0 && (
            <div className="mt-3 p-4 rounded-xl bg-error-container text-on-error-container flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div>
                <p className="font-bold">
                  {openInjuries.length === 1
                    ? `${openInjuries[0]!.body_part_label} is still healing`
                    : `${openInjuries.length} injuries still healing`}
                </p>
                <p className="text-body-sm opacity-90">
                  Your training plans are being kept away from{" "}
                  {openInjuries.map((i) => i.body_part_label).join(", ")}.
                </p>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => navigate("/injuries")}
              >
                Check in
              </Button>
            </div>
          )}

          <div className="mt-3">
            <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
              Welcome back
              {profile?.first_name ? `, ${profile.first_name}` : ""}!
            </h1>
            <p>{paceMessage(sessions.length, monthDelta)}</p>
            {streakWeeks > 1 && (
              <p className="text-primary font-medium mt-1">
                {streakWeeks} weeks climbing in a row — don't break it now.
              </p>
            )}
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
              {nextGoal && daysToGoal !== null && (
                <p className="text-xs text-on-surface-variant mt-1">
                  {daysToGoal >= 0
                    ? `Goal due in ${daysToGoal} day${daysToGoal === 1 ? "" : "s"}`
                    : `Goal was due ${Math.abs(daysToGoal)} day${Math.abs(daysToGoal) === 1 ? "" : "s"} ago`}
                </p>
              )}
            </Card>

            <Card className="p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium text-on-surface-variant">
                TOTAL TRIES
              </h3>
              <p className="text-3xl font-bold mt-2">{totalTriesCount}</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {totalSendsCount} sent across {attempts.length} route
                {attempts.length === 1 ? "" : "s"}
              </p>
            </Card>

            {/*
              The AI coach's own words, two lines of them. This card used to say
              "Coming soon" long after the coach shipped.
            */}
            <div className="p-4 rounded-xl shadow-sm bg-primary-container flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-medium text-on-primary-container">
                  AI COACH
                </h3>
                {coachSummary ? (
                  <p className="text-body-md mt-2 text-on-primary-container line-clamp-3">
                    {coachSummary}
                  </p>
                ) : (
                  <>
                    <p className="text-2xl font-bold mt-2 text-on-primary-container">
                      No analysis yet
                    </p>
                    <p className="text-body-sm mt-1 text-on-primary-container/90">
                      Generate one from your logged sessions.
                    </p>
                  </>
                )}
              </div>
              <Button
                variant="secondary"
                className="mt-4 font-medium w-full"
                onClick={() => navigate("/ai-coach")}
              >
                {coachSummary ? "Read the analysis" : "Open AI Coach"}
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
                      // A single placeholder slice needs no gap between slices.
                      paddingAngle={hasAttempts ? 5 : 0}
                      dataKey="value"
                    >
                      {successRateData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    {hasAttempts && (
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
                    )}
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  {hasAttempts ? (
                    <>
                      <span className="text-headline-sm font-bold text-on-surface">
                        {successRate}%
                      </span>
                      <span className="text-label-sm text-on-surface-variant">
                        Success
                      </span>
                    </>
                  ) : (
                    <span className="text-label-sm text-on-surface-variant">
                      No attempts yet
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-6">
            <h2 className="text-on-surface text-headline-md font-bold tracking-tight">
              Recent Activity
            </h2>
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
                  {session.duration_minutes && (
                    <p className="text-on-surface-variant text-body-sm">
                      {session.duration_minutes} min
                    </p>
                  )}
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
