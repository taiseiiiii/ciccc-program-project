import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { api } from "../lib/api";
import {
  WEEKDAYS,
  buildCalendar,
  currentMonth,
  dayLabel,
  monthLabel,
  shiftMonth,
} from "../lib/calendar";
import type MonthlyStats from "../types/StatsType";
import type { DailyStat, GradeStat } from "../types/StatsType";
import Card from "../components/Card";
import Button from "../components/Button";

/** "+3 from last month" / "−2 from last month" / "Same as last month". */
const changeLabel = (change: number): string => {
  if (change === 0) return "Same as last month";
  return `${change > 0 ? "+" : "−"}${Math.abs(change)} from last month`;
};

/**
 * Colour by how much was climbed that day. Opacity steps of one theme colour
 * rather than separate colours, so the scale reads as a single ramp and needs
 * no dark-mode variant.
 */
const cellTone = (day: DailyStat | null): string => {
  if (!day) return "invisible";
  if (day.sessions === 0) return "bg-surface-container-high/60";
  if (day.attempts === 0) return "bg-primary/20 text-on-surface";
  if (day.attempts <= 3) return "bg-primary/40 text-on-surface";
  if (day.attempts <= 7) return "bg-primary/70 text-on-primary";
  return "bg-primary text-on-primary font-semibold";
};

const cellDescription = (day: DailyStat): string =>
  `${dayLabel(day.date)}: ${day.sessions} session${day.sessions === 1 ? "" : "s"}, ` +
  `${day.attempts} attempt${day.attempts === 1 ? "" : "s"}`;

/* -------------------------------------------------------------------------- */
/* Shared chart styling                                                       */
/* -------------------------------------------------------------------------- */

// Recharts renders inline SVG, so it cannot use Tailwind classes. Passing the
// theme's CSS variables means the charts still follow the light/dark toggle:
// the variables are redefined under `.dark` and resolve at paint time.
const tooltipContentStyle: CSSProperties = {
  backgroundColor: "var(--color-surface-container-highest)",
  borderColor: "var(--color-outline-variant)",
  borderRadius: "8px",
  color: "var(--color-on-surface)",
};

const tooltipLabelStyle: CSSProperties = { color: "var(--color-on-surface)" };

const axisProps = {
  stroke: "var(--color-outline)",
  fontSize: 11,
  tickLine: false,
} as const;

const legendStyle: CSSProperties = { fontSize: 12 };

/* -------------------------------------------------------------------------- */
/* Presentational pieces                                                      */
/* -------------------------------------------------------------------------- */

const StatCard = ({
  label,
  value,
  hint,
  valueClassName = "text-primary",
}: {
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
}) => (
  <Card className="flex flex-col gap-1">
    <h2 className="text-label-sm text-on-surface-variant uppercase tracking-wide">
      {label}
    </h2>
    {/* `text-display` carries its own weight/line-height from the theme. */}
    <p className={`text-display ${valueClassName}`}>{value}</p>
    <p className="text-body-sm text-on-surface-variant">{hint}</p>
  </Card>
);

/**
 * Card wrapper for a chart. `summary` is read out to screen readers in place of
 * the SVG, which on its own announces nothing useful.
 */
const ChartCard = ({
  title,
  summary,
  isEmpty,
  children,
}: {
  title: string;
  summary: string;
  isEmpty?: boolean;
  children: ReactNode;
}) => (
  <Card className="flex flex-col">
    <h2 className="text-label-sm text-on-surface-variant uppercase tracking-wide">
      {title}
    </h2>
    {isEmpty ? (
      <p className="text-body-sm text-on-surface-variant py-10 text-center">
        Nothing logged for this month yet.
      </p>
    ) : (
      <>
        <p className="sr-only">{summary}</p>
        <div aria-hidden="true" className="mt-3">
          {children}
        </div>
      </>
    )}
  </Card>
);

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const Progress = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState<string>(currentMonth);
  const thisMonth = currentMonth();

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["stats", month],
    queryFn: () => api<{ data: MonthlyStats }>(`/stats?month=${month}`),
    // Stepping through months should not blank the page each time — keep the
    // previous month on screen until the new one arrives.
    placeholderData: keepPreviousData,
    // Only a newly logged session changes these numbers, and LogSession
    // invalidates ["stats"] when that happens.
    staleTime: 5 * 60 * 1000,
  });

  const stats = data?.data;
  const calendar = useMemo(() => buildCalendar(stats?.daily ?? []), [stats]);
  const weeks = calendar[0]?.length ?? 0;
  const hasGradeData = (stats?.byGrade.length ?? 0) > 0;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-primary text-headline-md font-bold tracking-tight">
        Performance Analytics
      </h1>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          aria-label={`Show ${monthLabel(shiftMonth(month, -1))}`}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <FiChevronLeft aria-hidden="true" />
        </Button>
        <span
          aria-live="polite"
          className="text-label-md min-w-36 text-center tabular-nums"
        >
          {monthLabel(month)}
        </span>
        <Button
          variant="secondary"
          // Future months can only ever be empty, so there is nothing to show.
          disabled={month >= thisMonth}
          aria-label={`Show ${monthLabel(shiftMonth(month, 1))}`}
          className="disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <FiChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="text-on-surface-variant">Loading your analytics...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card className="flex flex-col items-start gap-3">
          <p className="text-error">
            {error instanceof Error
              ? error.message
              : "Failed to load your analytics"}
          </p>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const { summary, daily, byGrade } = stats!;

  if (summary.sessions === 0) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-body-lg font-semibold">
            No sessions logged in {monthLabel(month)}
          </p>
          <p className="text-on-surface-variant">
            Log a gym visit and your analytics will show up here.
          </p>
          <Button className="mt-2" onClick={() => navigate("/log-session")}>
            Log a session
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${isFetching ? "opacity-60" : ""}`}>
      {header}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total sends"
          value={String(summary.sends)}
          hint={changeLabel(summary.sendsChange)}
        />
        <StatCard
          label="Highest grade"
          value={summary.highestGrade?.grade_name ?? "—"}
          valueClassName="text-secondary"
          hint={
            summary.nextGrade
              ? `Projecting ${summary.nextGrade.grade_name}`
              : summary.highestGrade
                ? "Sent everything you tried"
                : "No send logged yet"
          }
        />
        <StatCard
          label="Sessions"
          value={String(summary.sessions)}
          valueClassName="text-tertiary"
          hint={`${changeLabel(summary.sessionsChange)} · ${summary.avgAttemptsPerSession} attempts / session`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="Cumulative sessions"
          summary={`${summary.sessions} sessions logged in ${monthLabel(month)}.`}
        >
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="sessionsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  interval={4}
                  tickFormatter={(value) => String(Number(String(value).slice(8)))}
                  {...axisProps}
                />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  labelFormatter={(value) => dayLabel(String(value))}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeSessions"
                  stroke="var(--color-primary)"
                  fillOpacity={1}
                  fill="url(#sessionsFill)"
                  name="Sessions so far"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Success rate by grade"
          isEmpty={!hasGradeData}
          summary={byGrade
            .map((g) => `${g.grade_name}: ${g.successRate}%`)
            .join(", ")}
        >
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGrade} layout="vertical">
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  {...axisProps}
                />
                <YAxis
                  dataKey="grade_name"
                  type="category"
                  width={36}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value, _name, item) => {
                    const grade = item?.payload as GradeStat | undefined;
                    return [
                      grade
                        ? `${value}% (${grade.sends}/${grade.attempts} sent)`
                        : `${value}%`,
                      "Success rate",
                    ];
                  }}
                />
                <Bar
                  dataKey="successRate"
                  fill="var(--color-primary)"
                  radius={[0, 4, 4, 0]}
                  name="Success rate"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Session activity"
          summary={daily
            .filter((day) => day.sessions > 0)
            .map(cellDescription)
            .join(". ")}
        >
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `auto repeat(${weeks}, minmax(0, 1fr))`,
            }}
          >
            {calendar.map((row, weekday) => (
              <div key={WEEKDAYS[weekday]} className="contents">
                <div className="text-label-sm text-on-surface-variant pr-1 self-center">
                  {WEEKDAYS[weekday]}
                </div>
                {row.map((day, week) => (
                  <div
                    key={day ? day.date : `empty-${weekday}-${week}`}
                    // Hover tooltip only — screen readers get the whole grid as
                    // one sentence from ChartCard's `summary` instead.
                    title={day ? cellDescription(day) : undefined}
                    className={`h-8 rounded-md flex items-center justify-center text-body-sm transition-colors ${cellTone(day)}`}
                  >
                    {day && day.attempts > 0 ? day.attempts : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-3 text-label-sm text-on-surface-variant">
            <span>Fewer attempts</span>
            {[
              "bg-surface-container-high/60",
              "bg-primary/20",
              "bg-primary/40",
              "bg-primary/70",
              "bg-primary",
            ].map((tone) => (
              <span key={tone} className={`h-3 w-3 rounded-sm ${tone}`} />
            ))}
            <span>More</span>
          </div>
        </ChartCard>

        <ChartCard
          title="Attempts by grade"
          isEmpty={!hasGradeData}
          summary={byGrade
            .map((g) => `${g.grade_name}: ${g.sends} sent, ${g.fails} failed`)
            .join(", ")}
        >
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGrade}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-outline-variant)"
                />
                <XAxis dataKey="grade_name" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={legendStyle} />
                {/* stackId groups the two bars into one column per grade. */}
                <Bar
                  dataKey="sends"
                  stackId="attempts"
                  fill="var(--color-primary)"
                  name="Sent"
                />
                <Bar
                  dataKey="fails"
                  stackId="attempts"
                  fill="var(--color-tertiary)"
                  radius={[4, 4, 0, 0]}
                  name="Not sent"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
};

export default Progress;
