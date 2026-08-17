import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

import type Performance from "../types/PerformanceType";
import type { PerformanceUpdate } from "../types/PerformanceType";
import type Training from "../types/TrainingType";
import type { TrainingDrill, TrainingUpdate } from "../types/TrainingType";
import type ClimbingStats from "../types/ClimbingStatsType";
import Card from "../components/Card";
import Button from "../components/Button";
import ReportNotes from "../components/ReportNotes";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const UNSELECTED_BUTTON =
  "bg-surface-container-high text-on-surface hover:bg-surface-container-highest";

const PRIORITY_STYLES: Record<TrainingDrill["priority"], string> = {
  high: "text-secondary bg-secondary/10",
  medium: "text-tertiary bg-tertiary/10",
  low: "text-on-surface-variant bg-surface-container-high",
};

const formatDate = (date: string) =>
  // The T00:00:00 pins the date to local midnight; bare YYYY-MM-DD would be
  // parsed as UTC and could render as the previous day.
  new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatPeriod = (performance: Performance) =>
  performance.period_type === "daily"
    ? formatDate(performance.period_start)
    : new Date(`${performance.period_start}T00:00:00`).toLocaleDateString(
        "en-US",
        { month: "long", year: "numeric" },
      );

/** Split plain-text report into paragraphs for rendering. */
const paragraphs = (text: string | null) =>
  (text ?? "").split(/\n{2,}/).filter((p) => p.trim() !== "");

const chartTooltipStyle = {
  backgroundColor: "var(--color-surface-container-highest)",
  borderColor: "var(--color-outline-variant)",
  borderRadius: "8px",
  color: "var(--color-on-surface)",
} as const;

/**
 * Tries and sends per grade, straight from the report's own stats snapshot.
 *
 * Nothing is fetched for this: the numbers were computed by SQL when the
 * report was generated and stored alongside it, so the chart always matches
 * the text above it even after the underlying sessions change.
 */
const GradeChart = ({ stats }: { stats: ClimbingStats }) => {
  const data = stats.grade_breakdown.map((g) => ({
    grade: g.grade_name,
    Tries: g.attempts,
    Sends: g.sends,
  }));
  if (data.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
        Tries vs sends by grade
      </p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="grade" stroke="var(--color-outline)" fontSize={12} />
            <YAxis
              stroke="var(--color-outline)"
              fontSize={12}
              allowDecimals={false}
            />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="Tries"
              fill="var(--color-secondary-container)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="Sends"
              fill="var(--color-primary)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/** Success rate by wall angle or hold type. Absent when nothing was tagged. */
const TagChart = ({
  title,
  data,
}: {
  title: string;
  data: NonNullable<ClimbingStats["wall_breakdown"]>;
}) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
        {title}
      </p>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <XAxis
              type="number"
              domain={[0, 100]}
              unit="%"
              stroke="var(--color-outline)"
              fontSize={11}
            />
            <YAxis
              dataKey="label"
              type="category"
              width={84}
              stroke="var(--color-outline)"
              fontSize={12}
            />
            <Tooltip
              formatter={(value, _name, item) => [
                `${value}% of ${item?.payload?.attempts ?? 0} tries`,
                "Success rate",
              ]}
              contentStyle={chartTooltipStyle}
            />
            <Bar
              dataKey="success_rate"
              fill="var(--color-tertiary)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const AICoach = () => {
  const today = new Date().toLocaleDateString("sv-SE");
  const [periodType, setPeriodType] = useState<"daily" | "monthly">("monthly");
  const [selectedPerformanceId, setSelectedPerformanceId] = useState<
    number | null
  >(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState<number | null>(
    null,
  );
  // Which report's long-form text is expanded, rather than a bare boolean:
  // storing the id means switching reports collapses the disclosure without an
  // effect to reset it.
  const [detailForPerformanceId, setDetailForPerformanceId] = useState<
    number | null
  >(null);
  const [detailForTrainingId, setDetailForTrainingId] = useState<number | null>(
    null,
  );

  const queryClient = useQueryClient();

  const { data: performancesData, isPending: isPerformancesLoading } = useQuery({
    queryKey: ["performances"],
    queryFn: () => api<{ data: Performance[] }>("/performances"),
  });

  const { data: trainingsData, isPending: isTrainingsLoading } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => api<{ data: Training[] }>("/trainings"),
  });

  // Memoised so the trend chart below does not recompute on every render just
  // because `?? []` produced a fresh array.
  const performances = useMemo(
    () => performancesData?.data ?? [],
    [performancesData],
  );
  const trainings = trainingsData?.data ?? [];
  // Lists are pinned-first then newest-first, so with nothing selected we show
  // whatever the climber flagged as worth keeping, or else the latest.
  const performance =
    performances.find((p) => p.performance_id === selectedPerformanceId) ??
    performances[0];
  const training =
    trainings.find((t) => t.training_id === selectedTrainingId) ?? trainings[0];

  const showPerformanceDetail =
    performance !== undefined &&
    detailForPerformanceId === performance.performance_id;
  const showTrainingDetail =
    training !== undefined && detailForTrainingId === training.training_id;

  // Generation is synchronous on the server (one model round-trip), so the
  // mutation typically resolves in a few seconds — the button shows progress.
  const { mutate: generateAnalysis, isPending: isAnalyzing } = useMutation({
    mutationFn: () =>
      api<{ data: Performance }>("/performances", {
        method: "POST",
        // The client sends its local date: the server defaults to *its* today,
        // which can be a different day in the user's timezone.
        body: JSON.stringify({ period_type: periodType, date: today }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["performances"] });
      setSelectedPerformanceId(res.data.performance_id);
      toast.success("Performance analysis ready");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate analysis",
      );
    },
  });

  const { mutate: generatePlan, isPending: isPlanning } = useMutation({
    mutationFn: () =>
      api<{ data: Training }>("/trainings", {
        method: "POST",
        body: JSON.stringify({ date: today }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setSelectedTrainingId(res.data.training_id);
      toast.success("Training plan ready");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate training plan",
      );
    },
  });

  const { mutate: savePerformance, isPending: isSavingPerformance } =
    useMutation({
      mutationFn: ({ id, patch }: { id: number; patch: PerformanceUpdate }) =>
        api(`/performances/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["performances"] });
        toast.success("Saved");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      },
    });

  const { mutate: saveTraining, isPending: isSavingTraining } = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TrainingUpdate }) =>
      api(`/trainings/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      toast.success("Saved");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    },
  });

  const { mutate: deletePerformance } = useMutation({
    mutationFn: (id: number) =>
      api(`/performances/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performances"] });
      setSelectedPerformanceId(null);
      toast.success("Report deleted");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    },
  });

  const { mutate: deleteTraining } = useMutation({
    mutationFn: (id: number) => api(`/trainings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setSelectedTrainingId(null);
      toast.success("Training plan deleted");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    },
  });

  const analysis = performance?.analysis_data;
  const plan = training?.analysis_data;
  const stats = analysis?.stats;

  // The two lines the card leads with. Reports generated before the summary
  // field existed fall back to their headline rather than showing nothing.
  const performanceSummary = analysis?.summary ?? analysis?.headline;
  const planSummary = plan?.summary ?? plan?.headline;

  /**
   * Success rate across saved reports, oldest first.
   *
   * This is the review screen's real payoff: one report is a snapshot, but the
   * line through all of them is the thing a climber actually wants to see.
   * Only monthly reports are plotted — mixing daily ones in would put a single
   * good session next to a whole month and make the trend meaningless.
   */
  const trendData = useMemo(
    () =>
      performances
        .filter((p) => p.period_type === "monthly" && p.analysis_data?.stats)
        .map((p) => ({
          period: new Date(
            `${p.period_start}T00:00:00`,
          ).toLocaleDateString("en-US", { month: "short" }),
          successRate: p.analysis_data!.stats.success_rate,
          sends: p.analysis_data!.stats.total_sends,
        }))
        .reverse(),
    [performances],
  );

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
        AI Coach
      </h1>
      <p>
        Personalized coaching intelligence generated from your logged sessions.
      </p>

      {/* ---------------- Performance analysis ---------------- */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-on-surface text-headline-sm font-bold">
          Performance Update
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setPeriodType("daily")}
            className={periodType === "daily" ? "" : UNSELECTED_BUTTON}
          >
            Today
          </Button>
          <Button
            onClick={() => setPeriodType("monthly")}
            className={periodType === "monthly" ? "" : UNSELECTED_BUTTON}
          >
            This Month
          </Button>
          <Button onClick={() => generateAnalysis()} disabled={isAnalyzing}>
            {isAnalyzing ? "Analyzing..." : "Generate Analysis"}
          </Button>
        </div>
      </div>

      {isPerformancesLoading ? (
        <Card className="mt-3">
          <p className="text-on-surface-variant">Loading reports...</p>
        </Card>
      ) : !performance ? (
        <Card className="mt-3">
          <p className="font-bold">No analysis yet</p>
          <p className="text-on-surface-variant mt-1">
            Pick a period and hit “Generate Analysis” — the AI coach will
            review the sessions you logged and report on your strengths,
            weaknesses and grade trajectory.
          </p>
        </Card>
      ) : (
        <Card className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-primary bg-primary/10 font-bold px-2.5 py-1 rounded-full text-xs uppercase tracking-wide">
              {performance.period_type} report · {formatPeriod(performance)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={performance.is_pinned}
                title={performance.is_pinned ? "Unpin" : "Pin to the top"}
                onClick={() =>
                  savePerformance({
                    id: performance.performance_id,
                    patch: { is_pinned: !performance.is_pinned },
                  })
                }
                className={`cursor-pointer text-lg leading-none ${
                  performance.is_pinned
                    ? "text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {performance.is_pinned ? "★" : "☆"}
              </button>
              <span className="text-on-surface-variant text-xs">
                {performance.ai_model} · generated{" "}
                {formatDate(performance.created_at)}
              </span>
            </div>
          </div>

          {/* The two lines. Everything else on this card is optional reading. */}
          {performanceSummary && (
            <p className="text-on-surface text-headline-sm font-medium mt-3 leading-snug">
              {performanceSummary}
            </p>
          )}

          {analysis && (
            <p className="text-on-surface-variant mt-2">
              Trending toward{" "}
              <span className="text-primary font-bold">
                {analysis.grade_projection}
              </span>
              . {analysis.focus_advice}
            </p>
          )}

          {stats && <GradeChart stats={stats} />}
          {stats?.wall_breakdown && (
            <TagChart
              title="Success rate by wall angle"
              data={stats.wall_breakdown}
            />
          )}
          {stats?.hold_breakdown && (
            <TagChart
              title="Success rate by hold type"
              data={stats.hold_breakdown}
            />
          )}

          {analysis && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div className="bg-primary/10 rounded-lg p-4">
                <p className="text-label-md font-bold text-primary uppercase tracking-wide">
                  Strengths
                </p>
                <ul className="mt-2 list-disc list-inside">
                  {analysis.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-surface-container-high rounded-lg p-4">
                <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide">
                  Weaknesses
                </p>
                <ul className="mt-2 list-disc list-inside">
                  {analysis.weaknesses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* What the climber blamed, next to what the coach found. */}
          {stats?.self_reported_weaknesses &&
            stats.self_reported_weaknesses.length > 0 && (
              <div className="mt-4">
                <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
                  What you blamed
                </p>
                <div className="flex flex-wrap gap-2">
                  {stats.self_reported_weaknesses.map((w) => (
                    <span
                      key={w.label}
                      className="px-3 py-1 rounded-full bg-tertiary-container text-on-tertiary-container text-label-md"
                    >
                      {w.label} · {w.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {stats && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-3 border-t border-outline-variant text-on-surface-variant">
              <p>
                Sessions:{" "}
                <span className="font-bold text-on-surface">
                  {stats.total_sessions}
                </span>
              </p>
              <p>
                Tries:{" "}
                <span className="font-bold text-on-surface">
                  {stats.total_attempts}
                </span>
              </p>
              <p>
                Sends:{" "}
                <span className="font-bold text-on-surface">
                  {stats.total_sends}
                </span>
              </p>
              <p>
                Success rate:{" "}
                <span className="font-bold text-primary">
                  {stats.success_rate}%
                </span>
              </p>
              {stats.flash_count !== undefined && stats.flash_count > 0 && (
                <p>
                  Flashes:{" "}
                  <span className="font-bold text-on-surface">
                    {stats.flash_count}
                  </span>
                </p>
              )}
              {stats.highest_sent_grade && (
                <p>
                  Highest send:{" "}
                  <span className="font-bold text-on-surface">
                    {stats.highest_sent_grade}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* The long version, collapsed. */}
          {paragraphs(performance.performance_report).length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() =>
                  setDetailForPerformanceId(
                    showPerformanceDetail ? null : performance.performance_id,
                  )
                }
                className="text-primary text-label-md hover:underline cursor-pointer"
              >
                {showPerformanceDetail
                  ? "Hide the full analysis"
                  : "Read the full analysis"}
              </button>
              {showPerformanceDetail &&
                paragraphs(performance.performance_report).map((text, i) => (
                  <p key={i} className="mt-3">
                    {text}
                  </p>
                ))}
            </div>
          )}

          {/*
            The climber's own layer. The AI text above is never editable —
            comparing what it predicted with what happened only works if it
            still says what it said. Keyed by report id so switching reports
            remounts it with that report's note.
          */}
          <ReportNotes
            key={performance.performance_id}
            initialTitle={performance.title}
            initialNote={performance.user_note}
            titlePlaceholder="Name this report — e.g. 'the month I got V5'"
            notePlaceholder="Was the coach right? What did you change, and what happened?"
            isSaving={isSavingPerformance}
            onSave={(patch) =>
              savePerformance({ id: performance.performance_id, patch })
            }
            onDelete={() => deletePerformance(performance.performance_id)}
          />
        </Card>
      )}

      {/* ---------------- Review ---------------- */}
      {trendData.length > 1 && (
        <Card className="mt-3">
          <h3 className="text-sm font-medium text-on-surface-variant mb-3">
            SUCCESS RATE ACROSS YOUR MONTHLY REPORTS
          </h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis
                  dataKey="period"
                  stroke="var(--color-outline)"
                  fontSize={12}
                />
                <YAxis
                  stroke="var(--color-outline)"
                  fontSize={12}
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, "Success rate"]}
                  contentStyle={chartTooltipStyle}
                />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={{ fill: "var(--color-primary)", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {performances.length > 1 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {performances.map((p) => (
            <Button
              key={p.performance_id}
              variant="secondary"
              onClick={() => setSelectedPerformanceId(p.performance_id)}
              className={
                p.performance_id === performance?.performance_id
                  ? "bg-primary text-on-primary hover:bg-primary-container"
                  : ""
              }
            >
              {p.is_pinned && "★ "}
              {p.title ??
                `${p.period_type === "daily" ? "Daily" : "Monthly"} · ${formatPeriod(p)}`}
            </Button>
          ))}
        </div>
      )}

      {/* ---------------- Training plan ---------------- */}
      <div className="mt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-on-surface text-headline-sm font-bold">
          Training Protocol
        </h2>
        <Button onClick={() => generatePlan()} disabled={isPlanning}>
          {isPlanning ? "Building plan..." : "Generate Training Plan"}
        </Button>
      </div>

      {isTrainingsLoading ? (
        <Card className="mt-3">
          <p className="text-on-surface-variant">Loading training plans...</p>
        </Card>
      ) : !training ? (
        <Card className="mt-3">
          <p className="font-bold">No training plan yet</p>
          <p className="text-on-surface-variant mt-1">
            Hit “Generate Training Plan” and the AI coach will design drills
            for the coming weeks from your last 30 days of climbing and your
            goals.
          </p>
        </Card>
      ) : (
        <Card className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-primary bg-primary/10 font-bold px-2.5 py-1 rounded-full text-xs uppercase tracking-wide">
              Training plan
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={training.is_pinned}
                title={training.is_pinned ? "Unpin" : "Pin to the top"}
                onClick={() =>
                  saveTraining({
                    id: training.training_id,
                    patch: { is_pinned: !training.is_pinned },
                  })
                }
                className={`cursor-pointer text-lg leading-none ${
                  training.is_pinned
                    ? "text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {training.is_pinned ? "★" : "☆"}
              </button>
              <span className="text-on-surface-variant text-xs">
                {training.ai_model} · generated{" "}
                {formatDate(training.created_at)}
              </span>
            </div>
          </div>

          {planSummary && (
            <p className="text-on-surface text-headline-sm font-medium mt-3 leading-snug">
              {planSummary}
            </p>
          )}
          {plan && <p className="text-on-surface-variant mt-2">{plan.focus}</p>}

          {/*
            Drills the server dropped because they would have loaded an injured
            body part. Said out loud rather than hidden — a plan that quietly
            got shorter reads as a worse plan.
          */}
          {plan?.removed_for_injury && plan.removed_for_injury.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-error-container text-on-error-container">
              <p className="font-bold text-body-sm">
                Adjusted around your injury
              </p>
              <p className="text-body-sm opacity-90 mt-1">
                Removed: {plan.removed_for_injury.join(", ")}. See a doctor or
                physiotherapist if the pain persists or worsens.
              </p>
            </div>
          )}

          {plan && (
            <div className="flex flex-col gap-3 mt-4">
              {plan.drills.map((drill) => (
                <div
                  key={drill.title}
                  className="bg-surface-container-high rounded-lg p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{drill.title}</p>
                    <span
                      className={`${PRIORITY_STYLES[drill.priority]} font-bold px-2.5 py-1 rounded-full text-xs uppercase tracking-wide`}
                    >
                      {drill.priority} priority
                    </span>
                    <span className="text-on-surface-variant text-xs ml-auto">
                      {drill.frequency}
                    </span>
                  </div>
                  <p className="text-on-surface-variant mt-1">
                    {drill.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {paragraphs(training.training_report).length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() =>
                  setDetailForTrainingId(
                    showTrainingDetail ? null : training.training_id,
                  )
                }
                className="text-primary text-label-md hover:underline cursor-pointer"
              >
                {showTrainingDetail
                  ? "Hide the full plan"
                  : "Read the full plan"}
              </button>
              {showTrainingDetail &&
                paragraphs(training.training_report).map((text, i) => (
                  <p key={i} className="mt-3">
                    {text}
                  </p>
                ))}
            </div>
          )}

          <ReportNotes
            key={training.training_id}
            initialTitle={training.title}
            initialNote={training.user_note}
            titlePlaceholder="Name this plan — e.g. 'winter power block'"
            notePlaceholder="Which drills did you actually do? What worked?"
            isSaving={isSavingTraining}
            onSave={(patch) =>
              saveTraining({ id: training.training_id, patch })
            }
            onDelete={() => deleteTraining(training.training_id)}
          />
        </Card>
      )}

      {trainings.length > 1 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {trainings.map((t) => (
            <Button
              key={t.training_id}
              variant="secondary"
              onClick={() => setSelectedTrainingId(t.training_id)}
              className={
                t.training_id === training?.training_id
                  ? "bg-primary text-on-primary hover:bg-primary-container"
                  : ""
              }
            >
              {t.is_pinned && "★ "}
              {t.title ?? formatDate(t.created_at)}
            </Button>
          ))}
        </div>
      )}

      <p className="text-on-surface-variant text-body-sm mt-8">
        AI coaching is generated from your logged data and is not medical
        advice. If something hurts, rest it and see a doctor or
        physiotherapist.
      </p>
    </div>
  );
};

export default AICoach;
