import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  currentMonthKey,
  daysUntil,
  formatDate,
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

/**
 * Sub-headline under the welcome, phrased to match the month-over-month delta.
 * Returns the catalogue key rather than the sentence, so the choice of phrasing
 * stays here and the wording stays in the locale files.
 */
const paceMessageKey = (sessionCount: number, delta: number): string => {
  if (sessionCount === 0) return "welcome.paceFirstSession";
  if (delta > 0) return "welcome.paceAhead";
  if (delta < 0) return "welcome.paceBehind";
  return "welcome.paceMatching";
};

const Dashboard = () => {
  const { t } = useTranslation("dashboard");
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
    return (
      <p className="text-on-surface-variant animate-pulse">
        {t("state.loading")}
      </p>
    );
  }

  if (isError || !stats) {
    return (
      <Card className="mt-3">
        <p className="font-bold text-on-surface">{t("state.errorTitle")}</p>
        <p className="text-on-surface-variant mt-1">{t("state.errorBody")}</p>
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
        {
          name: t("charts.success"),
          value: successRate,
          color: "var(--color-primary)",
        },
        {
          name: t("charts.failed"),
          value: 100 - successRate,
          color: "var(--color-secondary-container)",
        },
      ]
    : [
        {
          name: t("charts.noData"),
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
                ? t("injuries.oneHealing", {
                    bodyPart: openInjuries[0]!.body_part_label,
                  })
                : t("injuries.manyHealing", { count: openInjuries.length })}
            </p>
            <p className="text-body-sm opacity-90">
              {t("injuries.avoiding", {
                bodyParts: openInjuries
                  .map((i) => i.body_part_label)
                  .join(", "),
              })}
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => navigate("/injuries")}
          >
            {t("injuries.checkIn")}
          </Button>
        </div>
      )}

      <div className="mt-3">
        <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
          {profile?.first_name
            ? t("welcome.titleNamed", { name: profile.first_name })
            : t("welcome.title")}
        </h1>
        <p>{t(paceMessageKey(stats.lifetime.sessions, monthDelta))}</p>
        {stats.streak_weeks > 1 && (
          <p className="text-primary font-medium mt-1">
            {t("welcome.streak", { count: stats.streak_weeks })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 mb-4">
        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            {t("stats.sessionsThisMonth")}
          </h3>
          <div className="gap-3 flex flex-row items-center">
            <p className="text-3xl font-bold mt-2 tabular-nums">
              {stats.current_month.sessions}
            </p>
            {monthDelta !== 0 && (
              <p className={monthDelta > 0 ? "text-primary" : "text-error"}>
                {t("stats.vsLastMonth", {
                  delta: monthDelta > 0 ? `+${monthDelta}` : monthDelta,
                })}
              </p>
            )}
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            {t("stats.highestGrade")}
          </h3>
          <p className="text-3xl font-bold mt-2">
            {stats.lifetime.highest_sent_grade ?? "-"}
          </p>
          {nextGoal && daysToGoal !== null && (
            <p className="text-xs text-on-surface-variant mt-1">
              {daysToGoal >= 0
                ? t("stats.goalDueIn", { count: daysToGoal })
                : t("stats.goalOverdue", { count: Math.abs(daysToGoal) })}
            </p>
          )}
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            {t("stats.totalTries")}
          </h3>
          <p className="text-3xl font-bold mt-2 tabular-nums">{totalTries}</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {t("stats.sentAcross", {
              sends: totalSends,
              routes: t("common:climb.routes", { count: totalRoutes }),
            })}
          </p>
        </Card>

        {/* The AI coach's own words, two lines of them. */}
        <div className="p-4 rounded-xl shadow-sm bg-primary-container flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-medium text-on-primary-container">
              {t("coach.title")}
            </h3>
            {coachSummary ? (
              <p className="text-body-md mt-2 text-on-primary-container line-clamp-3">
                {coachSummary}
              </p>
            ) : (
              <>
                <p className="text-2xl font-bold mt-2 text-on-primary-container">
                  {t("coach.noAnalysis")}
                </p>
                <p className="text-body-sm mt-1 text-on-primary-container/90">
                  {t("coach.noAnalysisBody")}
                </p>
              </>
            )}
          </div>
          <Button
            variant="secondary"
            className="mt-4 font-medium w-full"
            onClick={() => navigate("/ai-coach")}
          >
            {coachSummary ? t("coach.readAnalysis") : t("coach.open")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-4">
        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            {t("charts.monthlyVolume")}
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
            {t("charts.gradeProgress")}
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
                  formatter={(value) => [
                    `V${Number(value)}`,
                    t("charts.maxGrade"),
                  ]}
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
            {t("charts.successRateTitle")}
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
                    formatter={(value) => [
                      `${Number(value)}%`,
                      t("charts.rate"),
                    ]}
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
                    {t("charts.success")}
                  </span>
                </>
              ) : (
                <span className="text-label-sm text-on-surface-variant">
                  {t("charts.noAttempts")}
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-on-surface text-headline-md font-bold tracking-tight">
            {t("recentSessions.title")}
          </h2>
          <Link
            to="/sessions"
            className="text-label-md font-medium text-primary hover:underline"
          >
            {t("recentSessions.viewAll")}
          </Link>
        </div>
        <div className="flex flex-col gap-3 mt-3">
          {stats.recent_sessions.length === 0 && (
            <p className="text-on-surface-variant">
              {t("recentSessions.empty")}
            </p>
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
                    {session.gym_name ?? t("common:climb.climbingSession")}
                  </span>
                </div>
                <span className="text-on-surface-variant text-body-sm shrink-0">
                  {session.duration_minutes !== null &&
                    `${t("recentSessions.durationMinutes", {
                      count: session.duration_minutes,
                    })} · `}
                  {t("recentSessions.view")}
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
