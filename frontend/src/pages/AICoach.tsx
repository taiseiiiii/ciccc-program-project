import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

import type Performance from "../types/PerformanceType";
import type Training from "../types/TrainingType";
import type { TrainingDrill } from "../types/TrainingType";
import Card from "../components/Card";
import Button from "../components/Button";

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

const AICoach = () => {
  const today = new Date().toLocaleDateString("sv-SE");
  const [periodType, setPeriodType] = useState<"daily" | "monthly">("monthly");
  const [selectedPerformanceId, setSelectedPerformanceId] = useState<
    number | null
  >(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState<number | null>(
    null,
  );

  const queryClient = useQueryClient();

  const { data: performancesData, isPending: isPerformancesLoading } = useQuery(
    {
      queryKey: ["performances"],
      queryFn: () => api<{ data: Performance[] }>("/performances"),
    },
  );

  const { data: trainingsData, isPending: isTrainingsLoading } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => api<{ data: Training[] }>("/trainings"),
  });

  // Generation is synchronous on the server (one GPT-4o round-trip), so the
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

  const performances = performancesData?.data ?? [];
  const trainings = trainingsData?.data ?? [];
  // Lists are newest-first, so with nothing selected we show the latest.
  const performance =
    performances.find((p) => p.performance_id === selectedPerformanceId) ??
    performances[0];
  const training =
    trainings.find((t) => t.training_id === selectedTrainingId) ?? trainings[0];

  const analysis = performance?.analysis_data;
  const plan = training?.analysis_data;
  const stats = analysis?.stats;

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
            <span className="text-on-surface-variant text-xs">
              {performance.ai_model} · generated{" "}
              {formatDate(performance.created_at)}
            </span>
          </div>

          {analysis && (
            <h3 className="text-on-surface text-headline-md font-bold tracking-tight mt-3">
              Grade Projection: {analysis.grade_projection}
            </h3>
          )}
          {analysis && (
            <p className="text-on-surface-variant mt-1">{analysis.headline}</p>
          )}

          {paragraphs(performance.performance_report).map((text, i) => (
            <p key={i} className="mt-3">
              {text}
            </p>
          ))}

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

          {analysis && (
            <div className="border-l-4 border-primary pl-3 mt-4">
              <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide">
                Focus next
              </p>
              <p className="mt-1">{analysis.focus_advice}</p>
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
                Attempts:{" "}
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

          <div className="flex justify-end mt-3">
            <Button
              variant="error"
              onClick={() => deletePerformance(performance.performance_id)}
            >
              Delete
            </Button>
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
              {p.period_type === "daily" ? "Daily" : "Monthly"} ·{" "}
              {formatPeriod(p)}
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
            <span className="text-on-surface-variant text-xs">
              {training.ai_model} · generated {formatDate(training.created_at)}
            </span>
          </div>

          {plan && (
            <>
              <h3 className="text-on-surface text-headline-md font-bold tracking-tight mt-3">
                {plan.headline}
              </h3>
              <p className="text-on-surface-variant mt-1">{plan.focus}</p>

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
            </>
          )}

          {paragraphs(training.training_report).map((text, i) => (
            <p key={i} className="mt-3">
              {text}
            </p>
          ))}

          <div className="flex justify-end mt-3">
            <Button
              variant="error"
              onClick={() => deleteTraining(training.training_id)}
            >
              Delete
            </Button>
          </div>
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
              {formatDate(t.created_at)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AICoach;
