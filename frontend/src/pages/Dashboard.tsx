import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  currentMonthKey,
  daysUntil,
  formatDate,
  pluralize,
  todayString,
} from "../lib/date";
import type Stats from "../types/StatsType";
import type SessionType from "../types/SessionType";
import type Performance from "../types/PerformanceType";
import type Injury from "../types/InjuryType";
import type Goal from "../types/GoalType";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import SessionDetail from "../components/SessionDetail";
import { formatMonthShort } from "../lib/date";
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

/**
 * Shared by every chart on the page, so a tooltip cannot drift out of the
 * design system one card at a time.
 */
const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-surface-container-highest)",
  borderColor: "var(--color-outline-variant)",
  borderRadius: "8px",
  color: "var(--color-on-surface)",
} as const;

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
  // Recent Activity opens the visit. Until this existed, a logged session could
  // be counted but never read back — and its photos had nowhere to be shown.
  const [openSession, setOpenSession] = useState<SessionType | null>(null);

  /**
   * One request for every number on this page.
   *
   * This screen used to fetch `/sessions` and `/attempts` — the climber's whole
   * unpaginated history — and count it all in the browser. The query key is
   * shared with Progress, so opening both costs one request, not two.
   */
  const {
    data: statsData,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["stats", currentMonthKey()],
    queryFn: () =>
      api<{ data: Stats }>(
        `/stats?month=${currentMonthKey()}&today=${todayString()}`,
      ),
  });

  // The dashboard only ever shows the newest report, so it asks for one.
  const { data: performancesData } = useQuery({
    queryKey: ["performances", { limit: 1 }],
    queryFn: () => api<{ data: Performance[] }>("/performances?limit=1"),
  });

  const { data: injuriesData } = useQuery({
    queryKey: ["injuries"],
    queryFn: () => api<{ data: Injury[] }>("/injuries"),
  });

  const { data: goalsData } = useQuery({
    queryKey: ["goals"],
    queryFn: () => api<{ data: Goal[] }>("/goals"),
  });

  const stats = statsData?.data;
  const latestPerformance = performancesData?.data?.[0];
  const openInjuries = (injuriesData?.data ?? []).filter(
    (i) => i.status !== "healed",
  );

  // The goal with the nearest deadline — one line, not a list; Progress owns
  // the full picture.
  const nextGoal = (goalsData?.data ?? [])
    .filter((g) => !g.is_achieved && g.target_date)
    .sort((a, b) => a.target_date!.localeCompare(b.target_date!))[0];
  const daysToGoal = nextGoal?.target_date ? daysUntil(nextGoal.target_date) : null;

  const coachSummary =
    latestPerformance?.analysis_data?.summary ??
    latestPerformance?.analysis_data?.headline;

  if (isPending) {
    return <p className="text-on-surface-variant animate-pulse">Loading stats...</p>;
  }

  if (isError || !stats) {
    return (
      <Card className="mt-3">
        <p className="font-bold text-on-surface">Could not load your dashboard</p>
        <p className="text-on-surface-variant mt-1">
          The server did not answer. Your logged sessions are safe — try
          reloading in a moment.
        </p>
      </Card>
    );
  }

  const monthDelta = stats.current_month.sessions - stats.previous_month.sessions;

  const visitData = stats.months.map((m) => ({
    month: formatMonthShort(m.month),
    visits: m.sessions,
  }));

  // null (not 0) for months without a send, so the line shows a gap instead
  // of pretending the climber dropped to V0.
  const progressData = stats.months.map((m) => ({
    month: formatMonthShort(m.month),
    maxGrade: m.max_sent_level,
  }));

  const { attempts: totalTries, sends: totalSends, routes: totalRoutes } =
    stats.lifetime;
  const hasAttempts = totalTries > 0;
  const successRate = Math.round(stats.lifetime.success_rate);
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

  return (
    <div>
      {/*
        Injuries lead. Everything else on this page encourages more climbing,
        which is the wrong message to open with while something is still
        healing.
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
        <p>{paceMessage(stats.lifetime.sessions, monthDelta)}</p>
        {stats.streak_weeks > 1 && (
          <p className="text-primary font-medium mt-1">
            {stats.streak_weeks} weeks climbing in a row — don't break it now.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 mb-4">
        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            SESSIONS THIS MONTH
          </h3>
          <div className="gap-3 flex flex-row items-center">
            <p className="text-3xl font-bold mt-2 tabular-nums">
              {stats.current_month.sessions}
            </p>
            {monthDelta !== 0 && (
              <p className={monthDelta > 0 ? "text-primary" : "text-error"}>
                {monthDelta > 0 ? `+${monthDelta}` : monthDelta} vs last month
              </p>
            )}
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            HIGHEST GRADE
          </h3>
          <p className="text-3xl font-bold mt-2">
            {stats.lifetime.highest_sent_grade ?? "-"}
          </p>
          {nextGoal && daysToGoal !== null && (
            <p className="text-xs text-on-surface-variant mt-1">
              {daysToGoal >= 0
                ? `Goal due in ${pluralize(daysToGoal, "day")}`
                : `Goal was due ${pluralize(Math.abs(daysToGoal), "day")} ago`}
            </p>
          )}
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            TOTAL TRIES
          </h3>
          <p className="text-3xl font-bold mt-2 tabular-nums">{totalTries}</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {totalSends} sent across {pluralize(totalRoutes, "route")}
          </p>
        </Card>

        {/* The AI coach's own words, two lines of them. */}
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
                <XAxis dataKey="month" stroke="var(--color-outline)" fontSize={12} />
                <YAxis
                  stroke="var(--color-outline)"
                  fontSize={12}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
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
                <XAxis dataKey="month" stroke="var(--color-outline)" fontSize={12} />
                <YAxis
                  stroke="var(--color-outline)"
                  fontSize={12}
                  domain={[0, "auto"]}
                  allowDecimals={false}
                  tickFormatter={(value) => `V${value}`}
                />
                <Tooltip
                  formatter={(value) => [`V${Number(value)}`, "Max Grade"]}
                  contentStyle={TOOLTIP_STYLE}
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
                    contentStyle={TOOLTIP_STYLE}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {hasAttempts ? (
                <>
                  <span className="text-headline-sm font-bold text-on-surface tabular-nums">
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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-on-surface text-headline-md font-bold tracking-tight">
            Recent Activity
          </h2>
          <Link
            to="/sessions"
            className="text-label-md font-medium text-primary hover:underline"
          >
            View all sessions
          </Link>
        </div>
        <div className="flex flex-col gap-3 mt-3">
          {stats.recent_sessions.length === 0 && (
            <p className="text-on-surface-variant">No sessions logged yet.</p>
          )}
          {stats.recent_sessions.map((session) => (
            <Card key={session.session_id} className="p-0">
              <button
                type="button"
                onClick={() => setOpenSession(session)}
                className="w-full p-4 flex flex-row items-center justify-between gap-4 text-left cursor-pointer rounded-xl hover:bg-surface-container-high/40"
              >
                <div className="flex flex-row gap-4 min-w-0">
                  <span className="tabular-nums text-on-surface-variant">
                    {formatDate(session.visit_date)}
                  </span>
                  <span className="font-bold truncate">
                    {session.gym_name ?? "Climbing session"}
                  </span>
                </div>
                <span className="text-on-surface-variant text-body-sm shrink-0">
                  {session.duration_minutes !== null &&
                    `${session.duration_minutes} min · `}
                  View
                </span>
              </button>
            </Card>
          ))}
        </div>
      </div>

      <SessionDetail
        session={openSession}
        onClose={() => setOpenSession(null)}
      />
    </div>
  );
};

export default Dashboard;
