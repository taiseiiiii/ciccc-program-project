import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate, formatMonthLong, todayString } from "../lib/date";

import type Performance from "../types/PerformanceType";
import type { PerformanceUpdate } from "../types/PerformanceType";
import type Training from "../types/TrainingType";
import type { TrainingDrill, TrainingUpdate } from "../types/TrainingType";
import type ClimbingStats from "../types/ClimbingStatsType";
import Card from "../components/Card";
import Button from "../components/Button";
import ReportCard from "../components/ReportCard";
import ReportBrowserModal from "../components/ReportBrowserModal";
import ConfirmDialog from "../components/ConfirmDialog";
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

const chartTooltipStyle = {
  backgroundColor: "var(--color-surface-container-highest)",
  borderColor: "var(--color-outline-variant)",
  borderRadius: "8px",
  color: "var(--color-on-surface)",
} as const;

const formatPeriod = (performance: Performance) =>
  performance.period_type === "daily"
    ? formatDate(performance.period_start)
    : formatMonthLong(performance.period_start.slice(0, 7));

/**
 * Tries and sends per grade, straight from the report's own stats snapshot.
 *
 * Nothing is fetched for this: the numbers were computed by SQL when the
 * report was generated and stored alongside it, so the chart always matches
 * the text above it even after the underlying sessions change.
 */
const GradeChart = ({ stats }: { stats: ClimbingStats }) => {
  const { t } = useTranslation("coach");
  const data = stats.grade_breakdown.map((g) => ({
    grade: g.grade_name,
    Tries: g.attempts,
    Sends: g.sends,
  }));
  if (data.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
        {t("chart.gradeTitle")}
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
              name={t("chart.tries")}
              fill="var(--color-secondary-container)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="Sends"
              name={t("chart.sends")}
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
  const { t } = useTranslation("coach");
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
                t("chart.pctOfTries", {
                  pct: String(value),
                  count: Number(item?.payload?.attempts ?? 0),
                }),
                t("chart.successRate"),
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

/** A row of headline figures from a report's stats snapshot. */
const StatRow = ({ stats }: { stats: ClimbingStats }) => {
  const { t } = useTranslation("coach");

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-3 border-t border-outline-variant text-on-surface-variant">
      <p>
        {t("stats.sessions")}{" "}
        <span className="font-bold text-on-surface tabular-nums">
          {stats.total_sessions}
        </span>
      </p>
      <p>
        {t("stats.tries")}{" "}
        <span className="font-bold text-on-surface tabular-nums">
          {stats.total_attempts}
        </span>
      </p>
      <p>
        {t("stats.sends")}{" "}
        <span className="font-bold text-on-surface tabular-nums">
          {stats.total_sends}
        </span>
      </p>
      <p>
        {t("stats.successRate")}{" "}
        <span className="font-bold text-primary tabular-nums">
          {stats.success_rate}%
        </span>
      </p>
      {stats.flash_count !== undefined && stats.flash_count > 0 && (
        <p>
          {t("stats.flashes")}{" "}
          <span className="font-bold text-on-surface tabular-nums">
            {stats.flash_count}
          </span>
        </p>
      )}
      {stats.highest_sent_grade && (
        <p>
          {t("stats.highestSend")}{" "}
          <span className="font-bold text-on-surface">
            {stats.highest_sent_grade}
          </span>
        </p>
      )}
    </div>
  );
};

/** What the confirm dialog is currently asking about. */
type PendingDelete =
  | { kind: "performance"; id: number }
  | { kind: "training"; id: number }
  | null;

const AICoach = () => {
  const { t } = useTranslation("coach");
  const today = todayString();
  const [periodType, setPeriodType] = useState<"daily" | "monthly">("monthly");
  const [selectedPerformanceId, setSelectedPerformanceId] = useState<number | null>(
    null,
  );
  const [selectedTrainingId, setSelectedTrainingId] = useState<number | null>(null);
  // Which report's long-form text is expanded, rather than a bare boolean:
  // storing the id means switching reports collapses the disclosure without an
  // effect to reset it.
  const [detailForPerformanceId, setDetailForPerformanceId] = useState<number | null>(
    null,
  );
  const [detailForTrainingId, setDetailForTrainingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [browsingPerformances, setBrowsingPerformances] = useState(false);
  const [browsingTrainings, setBrowsingTrainings] = useState(false);

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

  // A report chosen in the browser may be older than the first page these
  // queries hold, in which case it has to be fetched on its own. Without this
  // the page would silently fall back to the newest report and look as though
  // the choice had not registered.
  const { data: pickedPerformance } = useQuery({
    queryKey: ["performances", selectedPerformanceId],
    queryFn: () =>
      api<{ data: Performance }>(`/performances/${selectedPerformanceId}`),
    enabled:
      selectedPerformanceId !== null &&
      !performances.some((p) => p.performance_id === selectedPerformanceId),
  });

  const { data: pickedTraining } = useQuery({
    queryKey: ["trainings", selectedTrainingId],
    queryFn: () => api<{ data: Training }>(`/trainings/${selectedTrainingId}`),
    enabled:
      selectedTrainingId !== null &&
      !trainings.some((t) => t.training_id === selectedTrainingId),
  });

  // Lists are pinned-first then newest-first, so with nothing selected we show
  // whatever the climber flagged as worth keeping, or else the latest.
  const performance =
    performances.find((p) => p.performance_id === selectedPerformanceId) ??
    pickedPerformance?.data ??
    performances[0];
  const training =
    trainings.find((t) => t.training_id === selectedTrainingId) ??
    pickedTraining?.data ??
    trainings[0];

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
      toast.success(t("toast.analysisReady"));
    },
    onError: (err) => toast.error(err.message),
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
      toast.success(t("toast.planReady"));
    },
    onError: (err) => toast.error(err.message),
  });

  const { mutate: savePerformance, isPending: isSavingPerformance } = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: PerformanceUpdate }) =>
      api(`/performances/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performances"] });
      toast.success(t("toast.saved"));
    },
    onError: (err) => toast.error(err.message),
  });

  const { mutate: saveTraining, isPending: isSavingTraining } = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TrainingUpdate }) =>
      api(`/trainings/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      toast.success(t("toast.saved"));
    },
    onError: (err) => toast.error(err.message),
  });

  const { mutate: deleteReport, isPending: isDeleting } = useMutation({
    mutationFn: (target: NonNullable<PendingDelete>) =>
      api(
        target.kind === "performance"
          ? `/performances/${target.id}`
          : `/trainings/${target.id}`,
        { method: "DELETE" },
      ),
    onSuccess: (_res, target) => {
      if (target.kind === "performance") {
        queryClient.invalidateQueries({ queryKey: ["performances"] });
        setSelectedPerformanceId(null);
        toast.success(t("toast.reportDeleted"));
      } else {
        queryClient.invalidateQueries({ queryKey: ["trainings"] });
        setSelectedTrainingId(null);
        toast.success(t("toast.planDeleted"));
      }
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err.message),
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
          period: formatMonthLong(p.period_start.slice(0, 7)).split(" ")[0],
          successRate: p.analysis_data!.stats.success_rate,
          sends: p.analysis_data!.stats.total_sends,
        }))
        .reverse(),
    [performances],
  );

  return (
    <div className="max-w-5xl mx-auto">
      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteReport(pendingDelete)}
        title={
          pendingDelete?.kind === "training"
            ? t("delete.planTitle")
            : t("delete.reportTitle")
        }
        // A generated report is a snapshot: regenerating gives a new one from
        // today's data, not this one back.
        message={t("delete.message")}
        confirmLabel={t("common:action.delete")}
        isPending={isDeleting}
      />

      <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
        {t("title")}
      </h1>
      <p>{t("subtitle")}</p>

      {/* ---------------- Performance analysis ---------------- */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-on-surface text-headline-sm font-bold">
          {t("performance.heading")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setPeriodType("daily")}
            aria-pressed={periodType === "daily"}
            className={periodType === "daily" ? "" : UNSELECTED_BUTTON}
          >
            {t("performance.today")}
          </Button>
          <Button
            onClick={() => setPeriodType("monthly")}
            aria-pressed={periodType === "monthly"}
            className={periodType === "monthly" ? "" : UNSELECTED_BUTTON}
          >
            {t("performance.thisMonth")}
          </Button>
          <Button onClick={() => generateAnalysis()} disabled={isAnalyzing}>
            {isAnalyzing
              ? t("performance.generating")
              : t("performance.generate")}
          </Button>
        </div>
      </div>

      {isPerformancesLoading ? (
        <Card className="mt-3">
          <p className="text-on-surface-variant">{t("performance.loading")}</p>
        </Card>
      ) : !performance ? (
        <Card className="mt-3">
          <p className="font-bold">{t("performance.emptyTitle")}</p>
          <p className="text-on-surface-variant mt-1">
            {t("performance.emptyBody")}
          </p>
        </Card>
      ) : (
        <ReportCard
          key={performance.performance_id}
          label={t("performance.label", {
            period: t(`performance.period.${performance.period_type}`),
            date: formatPeriod(performance),
          })}
          aiModel={performance.ai_model}
          createdAt={performance.created_at}
          isPinned={performance.is_pinned}
          onTogglePin={() =>
            savePerformance({
              id: performance.performance_id,
              patch: { is_pinned: !performance.is_pinned },
            })
          }
          summary={performanceSummary}
          subtitle={
            analysis && (
              <>
                <Trans
                  i18nKey="performance.trending"
                  ns="coach"
                  values={{ grade: analysis.grade_projection }}
                  components={{
                    grade: <span className="text-primary font-bold" />,
                  }}
                />{" "}
                {analysis.focus_advice}
              </>
            )
          }
          detail={performance.performance_report}
          isDetailOpen={detailForPerformanceId === performance.performance_id}
          onToggleDetail={() =>
            setDetailForPerformanceId(
              detailForPerformanceId === performance.performance_id
                ? null
                : performance.performance_id,
            )
          }
          showLabel={t("performance.showDetail")}
          hideLabel={t("performance.hideDetail")}
          titlePlaceholder={t("performance.titlePlaceholder")}
          notePlaceholder={t("performance.notePlaceholder")}
          initialTitle={performance.title}
          initialNote={performance.user_note}
          isSaving={isSavingPerformance}
          onSaveNotes={(patch) =>
            savePerformance({ id: performance.performance_id, patch })
          }
          onDelete={() =>
            setPendingDelete({
              kind: "performance",
              id: performance.performance_id,
            })
          }
        >
          {stats && <GradeChart stats={stats} />}
          {stats?.wall_breakdown && (
            <TagChart
              title={t("chart.byWallAngle")}
              data={stats.wall_breakdown}
            />
          )}
          {stats?.hold_breakdown && (
            <TagChart
              title={t("chart.byHoldType")}
              data={stats.hold_breakdown}
            />
          )}

          {analysis && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div className="bg-primary/10 rounded-lg p-4">
                <p className="text-label-md font-bold text-primary uppercase tracking-wide">
                  {t("analysis.strengths")}
                </p>
                <ul className="mt-2 list-disc list-inside">
                  {/* Keyed by index: these are model-generated strings and two
                      of them can legitimately be identical. */}
                  {analysis.strengths.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-surface-container-high rounded-lg p-4">
                <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide">
                  {t("analysis.weaknesses")}
                </p>
                <ul className="mt-2 list-disc list-inside">
                  {analysis.weaknesses.map((item, i) => (
                    <li key={i}>{item}</li>
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
                  {t("analysis.selfReported")}
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

          {stats && <StatRow stats={stats} />}
        </ReportCard>
      )}

      {/* ---------------- Review ---------------- */}
      {trendData.length > 1 && (
        <Card className="mt-3">
          <h3 className="text-sm font-medium text-on-surface-variant mb-3">
            {t("trend.heading")}
          </h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis dataKey="period" stroke="var(--color-outline)" fontSize={12} />
                <YAxis
                  stroke="var(--color-outline)"
                  fontSize={12}
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, t("chart.successRate")]}
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
        <div className="mt-3">
          <Button variant="secondary" onClick={() => setBrowsingPerformances(true)}>
            {t("performance.browse")}
          </Button>
        </div>
      )}

      {/* ---------------- Training plan ---------------- */}
      <div className="mt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-on-surface text-headline-sm font-bold">
          {t("training.heading")}
        </h2>
        <Button onClick={() => generatePlan()} disabled={isPlanning}>
          {isPlanning ? t("training.generating") : t("training.generate")}
        </Button>
      </div>

      {isTrainingsLoading ? (
        <Card className="mt-3">
          <p className="text-on-surface-variant">{t("training.loading")}</p>
        </Card>
      ) : !training ? (
        <Card className="mt-3">
          <p className="font-bold">{t("training.emptyTitle")}</p>
          <p className="text-on-surface-variant mt-1">
            {t("training.emptyBody")}
          </p>
        </Card>
      ) : (
        <ReportCard
          key={training.training_id}
          label={t("training.label")}
          aiModel={training.ai_model}
          createdAt={training.created_at}
          isPinned={training.is_pinned}
          onTogglePin={() =>
            saveTraining({
              id: training.training_id,
              patch: { is_pinned: !training.is_pinned },
            })
          }
          summary={planSummary}
          subtitle={plan?.focus}
          detail={training.training_report}
          isDetailOpen={detailForTrainingId === training.training_id}
          onToggleDetail={() =>
            setDetailForTrainingId(
              detailForTrainingId === training.training_id
                ? null
                : training.training_id,
            )
          }
          showLabel={t("training.showDetail")}
          hideLabel={t("training.hideDetail")}
          titlePlaceholder={t("training.titlePlaceholder")}
          notePlaceholder={t("training.notePlaceholder")}
          initialTitle={training.title}
          initialNote={training.user_note}
          isSaving={isSavingTraining}
          onSaveNotes={(patch) =>
            saveTraining({ id: training.training_id, patch })
          }
          onDelete={() =>
            setPendingDelete({ kind: "training", id: training.training_id })
          }
        >
          {/*
            Drills the server dropped because they would have loaded an injured
            body part. Said out loud rather than hidden — a plan that quietly
            got shorter reads as a worse plan.
          */}
          {plan?.removed_for_injury && plan.removed_for_injury.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-error-container text-on-error-container">
              <p className="font-bold text-body-sm">
                {t("training.adjustedTitle")}
              </p>
              <p className="text-body-sm opacity-90 mt-1">
                {t("training.adjustedBody", {
                  drills: plan.removed_for_injury.join(", "),
                })}
              </p>
            </div>
          )}

          {plan && (
            <div className="flex flex-col gap-3 mt-4">
              {plan.drills.map((drill, i) => (
                <div key={i} className="bg-surface-container-high rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{drill.title}</p>
                    <span
                      className={`${PRIORITY_STYLES[drill.priority]} font-bold px-2.5 py-1 rounded-full text-xs uppercase tracking-wide`}
                    >
                      {t(`training.priority.${drill.priority}`)}
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
        </ReportCard>
      )}

      {trainings.length > 1 && (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => setBrowsingTrainings(true)}>
            {t("training.browse")}
          </Button>
        </div>
      )}

      <p className="text-on-surface-variant text-body-sm mt-8">
        {t("disclaimer")}
      </p>

      {/*
        Both browsers page through the full archive on their own, rather than
        reading the first-page lists above — that is the point of them.
      */}
      <ReportBrowserModal
        open={browsingPerformances}
        onClose={() => setBrowsingPerformances(false)}
        title={t("performance.browserTitle")}
        endpoint="/performances"
        toReport={(row: Performance) => ({
          id: row.performance_id,
          title: row.title,
          createdAt: row.created_at,
          isPinned: row.is_pinned,
          periodLabel: t("performance.periodLabel", {
            period: t(`performance.period.${row.period_type}`),
            date: formatPeriod(row),
          }),
          summary:
            row.analysis_data?.summary ?? row.analysis_data?.headline,
          detail: row.performance_report,
          note: row.user_note,
        })}
        extraFilters={[
          {
            label: t("performance.period.daily"),
            param: "period_type",
            value: "daily",
          },
          {
            label: t("performance.period.monthly"),
            param: "period_type",
            value: "monthly",
          },
        ]}
        onOpenReport={setSelectedPerformanceId}
        onTogglePin={(report) =>
          savePerformance({
            id: report.id,
            patch: { is_pinned: !report.isPinned },
          })
        }
      />

      <ReportBrowserModal
        open={browsingTrainings}
        onClose={() => setBrowsingTrainings(false)}
        title={t("training.browserTitle")}
        endpoint="/trainings"
        toReport={(row: Training) => ({
          id: row.training_id,
          title: row.title,
          createdAt: row.created_at,
          isPinned: row.is_pinned,
          summary: row.analysis_data?.summary,
          detail: row.training_report,
          note: row.user_note,
        })}
        onOpenReport={setSelectedTrainingId}
        onTogglePin={(report) =>
          saveTraining({ id: report.id, patch: { is_pinned: !report.isPinned } })
        }
      />
    </div>
  );
};

export default AICoach;
