import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import {
  currentMonthKey,
  formatDate,
  formatDayMonth,
  formatMinutes,
  pluralize,
  todayString,
} from "../lib/date";
import type Stats from "../types/StatsType";
import type Goal from "../types/GoalType";
import type { GoalCreate, GoalUpdate } from "../types/GoalType";
import type Grade from "../types/GradeType";
import type { SessionSummary } from "../types/SessionType";
import SessionDetail from "../components/SessionDetail";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Textarea from "../components/Textarea";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-surface-container-highest)",
  borderColor: "var(--color-outline-variant)",
  borderRadius: "8px",
  color: "var(--color-on-surface)",
} as const;

// Active goals shown before "View all" is pressed. Three is what fits above
// the fold on a phone — a longer list turns the page's opening into a backlog.
const GOALS_PREVIEW_COUNT = 3;

const getTileColor = (count: number) => {
  if (count === 0)
    return "bg-surface-container-high/30 text-on-surface-variant/50";
  if (count === 1) return "bg-primary/50 text-on-primary font-medium";
  if (count === 2) return "bg-primary/80 text-on-primary font-bold";
  return "bg-primary text-on-primary font-bold shadow-sm";
};

/** A stat card's month-over-month line, or nothing when the delta is zero. */
const Delta = ({
  value,
  format = String,
}: {
  value: number;
  format?: (n: number) => string;
}) => {
  if (value === 0) return null;
  return (
    <p className={value > 0 ? "text-primary" : "text-error"}>
      {value > 0 ? "+" : "−"}
      {format(Math.abs(value))} from last month
    </p>
  );
};

/** Enough to recognise the last few visits, not enough to become a list screen. */
const RECENT_SESSIONS = 4;

const Progress = () => {
  const queryClient = useQueryClient();
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [goalDescription, setGoalDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [openSession, setOpenSession] = useState<SessionSummary | null>(null);
  const [showAllGoals, setShowAllGoals] = useState(false);

  const month = currentMonthKey();

  /**
   * Every figure on this page, counted in SQL.
   *
   * The same query key the Dashboard uses, so navigating between the two
   * screens costs nothing. This replaced fetching `/sessions` and `/attempts`
   * in full and deriving fourteen aggregates from them on every keystroke in
   * the goal form.
   */
  const {
    data: statsData,
    isPending: isStatsLoading,
    isError: isStatsError,
  } = useQuery({
    queryKey: ["stats", month],
    queryFn: () =>
      api<{ data: Stats }>(`/stats?month=${month}&today=${todayString()}`),
  });

  const {
    data: goalsData,
    isPending: isGoalsLoading,
    isError: isGoalsError,
  } = useQuery({
    queryKey: ["goals"],
    queryFn: () => api<{ data: Goal[] }>("/goals"),
  });

  const {
    data: gradesData,
    isPending: isGradesLoading,
    isError: isGradesError,
  } = useQuery({
    queryKey: ["grades"],
    queryFn: () => api<{ data: Grade[] }>("/grades"),
    // Read-only master data (V0–V17). It never changes while the app is open,
    // so never refetch it — same treatment as the LogSession copy.
    staleTime: Infinity,
  });

  // The latest few visits, as a way into the session screen. Four rather than
  // the whole history: this page is about the aggregate, and the list is here
  // to open one, not to browse them.
  const { data: recentSessionsData } = useQuery({
    queryKey: ["sessions", { limit: RECENT_SESSIONS }],
    queryFn: () =>
      api<{ data: SessionSummary[] }>(`/sessions?limit=${RECENT_SESSIONS}`),
  });

  const goals = goalsData?.data ?? [];
  const grades = gradesData?.data ?? [];
  const stats = statsData?.data;
  const recentSessions = recentSessionsData?.data ?? [];

  const isLoading = isStatsLoading || isGoalsLoading || isGradesLoading;
  const isError = isStatsError || isGoalsError || isGradesError;

  const resetGoalForm = () => {
    setSelectedGradeId(null);
    setTargetDate("");
    setGoalDescription("");
    setEditingGoalId(null);
  };

  const handleCloseModal = () => {
    setIsGoalModalOpen(false);
    resetGoalForm();
  };

  const invalidateGoals = () =>
    queryClient.invalidateQueries({ queryKey: ["goals"] });

  const createGoalMutation = useMutation<{ data: Goal }, Error, GoalCreate>({
    mutationFn: (newGoal) =>
      api("/goals", { method: "POST", body: JSON.stringify(newGoal) }),
    onSuccess: () => {
      invalidateGoals();
      toast.success("Goal created");
      handleCloseModal();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateGoalMutation = useMutation<
    { data: Goal },
    Error,
    { goalId: number; updatedGoal: GoalUpdate }
  >({
    mutationFn: ({ goalId, updatedGoal }) =>
      api(`/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify(updatedGoal),
      }),
    onSuccess: () => {
      invalidateGoals();
      toast.success("Goal updated");
      handleCloseModal();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteGoalMutation = useMutation<unknown, Error, number>({
    mutationFn: (goalId) => api(`/goals/${goalId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateGoals();
      toast.success("Goal deleted");
      setIsDeleteConfirmOpen(false);
      handleCloseModal();
    },
    onError: (error) => toast.error(error.message),
  });

  const getGradeName = (gradeId: number) =>
    grades.find((g) => g.grade_id === gradeId)?.grade_name ?? `Grade ${gradeId}`;

  const handleSaveGoal = () => {
    if (!selectedGradeId) {
      toast.error("Pick a target grade first");
      return;
    }

    const payload: GoalCreate & GoalUpdate = {
      grade_id: selectedGradeId,
      goal_description: goalDescription.trim() || null,
      target_date: targetDate || null,
    };

    if (editingGoalId) {
      updateGoalMutation.mutate({ goalId: editingGoalId, updatedGoal: payload });
    } else {
      createGoalMutation.mutate(payload);
    }
  };

  const handleOpenEditModal = (goal: Goal) => {
    setEditingGoalId(goal.goal_id);
    setSelectedGradeId(goal.grade_id);
    setTargetDate(goal.target_date ?? "");
    setGoalDescription(goal.goal_description ?? "");
    setIsGoalModalOpen(true);
  };

  // Soonest deadlines first, so the three that show are the three that matter.
  // Goals with no deadline sort last.
  const sortedActiveGoals = goals
    .filter((g) => !g.is_achieved)
    .sort((a, b) => {
      if (!a.target_date && !b.target_date) return 0;
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return a.target_date.localeCompare(b.target_date);
    });
  const visibleGoals = showAllGoals
    ? sortedActiveGoals
    : sortedActiveGoals.slice(0, GOALS_PREVIEW_COUNT);
  const hiddenGoalCount = sortedActiveGoals.length - visibleGoals.length;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-on-surface-variant animate-pulse">
          Loading analytics data...
        </p>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <Card className="mt-3">
        <p className="font-bold text-on-surface">
          Could not load your analytics
        </p>
        <p className="text-on-surface-variant mt-1">
          The server did not answer. Nothing you logged has been lost — try
          reloading in a moment.
        </p>
      </Card>
    );
  }

  const thisMonth = stats.current_month;
  const lastMonth = stats.previous_month;

  // Running total of visits across the month so far. A reduce rather than a
  // mutated counter, so nothing outlives the render that built it.
  const monthlySessionFrequencyData = stats.daily
    .filter((day) => day.date.startsWith(month))
    .reduce<
      Array<{ date: string; sessions: number; cumulativeSessions: number }>
    >((days, day) => {
      const previous = days[days.length - 1]?.cumulativeSessions ?? 0;
      days.push({
        date: formatDayMonth(day.date),
        sessions: day.sessions,
        cumulativeSessions: previous + day.sessions,
      });
      return days;
    }, []);

  const gradeSuccessRateData = stats.grade_breakdown.map((g) => ({
    grade: g.grade_name,
    successRate: g.attempts > 0 ? Math.round((g.sends / g.attempts) * 100) : 0,
    sends: g.sends,
    fails: g.fails,
  }));

  const wallSuccessRateData = [...stats.wall_breakdown]
    .sort((a, b) => b.success_rate - a.success_rate)
    .map((w) => ({
      wall: w.label,
      successRate: Math.round(w.success_rate),
      tries: w.attempts,
    }));

  return (
    <div>
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => editingGoalId && deleteGoalMutation.mutate(editingGoalId)}
        title="Delete goal"
        message="This removes the goal and its deadline. Your logged climbs are not affected."
        isPending={deleteGoalMutation.isPending}
      />

      <Modal
        open={isGoalModalOpen}
        onClose={handleCloseModal}
        title={editingGoalId ? "Edit goal" : "Set a new goal"}
        footer={
          <>
            {editingGoalId ? (
              <Button
                variant="error"
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={deleteGoalMutation.isPending}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveGoal}
                disabled={
                  createGoalMutation.isPending || updateGoalMutation.isPending
                }
              >
                {createGoalMutation.isPending || updateGoalMutation.isPending
                  ? "Saving..."
                  : editingGoalId
                    ? "Update goal"
                    : "Save goal"}
              </Button>
            </div>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-label-md text-on-surface-variant mb-2">
              Target grade
            </p>
            {isGradesLoading ? (
              <p className="text-body-sm text-on-surface-variant">
                Loading grades...
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                {grades.map((grade) => {
                  const isSelected = selectedGradeId === grade.grade_id;
                  return (
                    <button
                      key={grade.grade_id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedGradeId(grade.grade_id)}
                      className={`px-3 py-1.5 rounded-lg text-label-md transition-colors cursor-pointer border ${
                        isSelected
                          ? "bg-primary text-on-primary border-primary font-bold"
                          : "bg-surface-container-high text-on-surface border-outline-variant hover:bg-surface-container-highest"
                      }`}
                    >
                      {grade.grade_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Input
            type="date"
            label="Target date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />

          <Textarea
            label="Description / memo"
            placeholder="Send V5 in one month!!"
            rows={3}
            className="resize-none"
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
          />
        </div>
      </Modal>

      <h1 className="text-primary text-headline-md font-bold tracking-tight mb-4">
        Performance Analytics
      </h1>

      <Card className="p-4 mb-6 border border-outline-variant/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">
              Active Goals
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold tabular-nums">
              {sortedActiveGoals.length}
            </span>
          </div>

          <Button onClick={() => setIsGoalModalOpen(true)} className="text-xs">
            + Add goal
          </Button>
        </div>

        <div className="flex flex-col gap-2.5">
          {sortedActiveGoals.length > 0 ? (
            visibleGoals.map((goal) => (
              <div
                key={goal.goal_id}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/20 hover:border-outline-variant/50 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                  <div className="shrink-0 w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-base">
                    {getGradeName(goal.grade_id)}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm text-on-surface truncate">
                      {goal.goal_description ?? `Send ${getGradeName(goal.grade_id)}`}
                    </span>
                    {goal.target_date && (
                      <span className="text-xs text-on-surface-variant">
                        Due {formatDate(goal.target_date)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenEditModal(goal)}
                    className="text-xs"
                  >
                    Edit
                  </Button>
                  <Button
                    className="text-xs"
                    disabled={updateGoalMutation.isPending}
                    onClick={() =>
                      updateGoalMutation.mutate({
                        goalId: goal.goal_id,
                        updatedGoal: { is_achieved: true },
                      })
                    }
                  >
                    Complete
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 px-4 border border-dashed border-outline-variant/40 rounded-xl flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-on-surface-variant">
                No active goals set yet.
              </p>
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => setIsGoalModalOpen(true)}
              >
                Set your first climbing goal
              </Button>
            </div>
          )}
        </div>

        {sortedActiveGoals.length > GOALS_PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setShowAllGoals((shown) => !shown)}
            className="w-full mt-3 py-2 text-xs font-medium text-primary hover:underline cursor-pointer"
          >
            {showAllGoals
              ? "Show less"
              : `View all ${sortedActiveGoals.length} goals (${hiddenGoalCount} more)`}
          </button>
        )}
      </Card>

      <Card className="p-4 mb-6 border border-outline-variant/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">
            Recent Sessions
          </h2>
          <Link
            to="/sessions"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all sessions
          </Link>
        </div>

        {recentSessions.length === 0 ? (
          <p className="text-on-surface-variant text-body-sm">
            No sessions logged yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {recentSessions.map((session) => (
              <button
                key={session.session_id}
                type="button"
                onClick={() => setOpenSession(session)}
                className="w-full flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left cursor-pointer rounded-lg px-2 py-1.5 hover:bg-surface-container-high/40"
              >
                <span className="flex items-baseline gap-3 min-w-0">
                  <span className="tabular-nums text-on-surface-variant text-body-sm shrink-0">
                    {formatDate(session.visit_date)}
                  </span>
                  <span className="font-bold truncate">
                    {session.gym_name ?? "Climbing session"}
                  </span>
                </span>
                <span className="text-on-surface-variant text-body-sm shrink-0">
                  {session.climb_count === 0
                    ? "No climbs"
                    : `${pluralize(session.climb_count, "route")} · ${session.total_sends}/${session.total_attempts} sent`}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 mb-4">
        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            TOTAL SENDS / MONTH
          </h3>
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-bold mt-2 text-primary tabular-nums">
              {thisMonth.sends}{" "}
              <span className="text-sm font-bold text-primary">
                / {thisMonth.attempts} tries
              </span>
            </p>
            <div className="flex flex-col gap-1">
              <Delta value={thisMonth.sends - lastMonth.sends} />
              {thisMonth.flashes > 0 && (
                <p className="text-xs text-on-surface-variant">
                  {thisMonth.flashes} flashed first try
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            HIGHEST GRADE / MONTH
          </h3>
          <p className="text-4xl font-bold mt-2 text-secondary">
            {thisMonth.highest_sent_grade ?? "-"}
          </p>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            CLIMBING DAYS / MONTH
          </h3>
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-bold mt-2 text-tertiary tabular-nums">
              {pluralize(thisMonth.climbing_days, "day")}
            </p>
            <Delta value={thisMonth.climbing_days - lastMonth.climbing_days} />
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            TIME ON THE WALL
          </h3>
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-bold mt-2 text-primary tabular-nums">
              {formatMinutes(thisMonth.minutes)}
            </p>
            {thisMonth.minutes === 0 ? (
              // Not a zero — it means nobody typed a duration. Saying "0h"
              // would read as "you did not climb", which is a different claim.
              <p className="text-xs text-on-surface-variant">
                Add a session length when you log
              </p>
            ) : (
              <Delta
                value={thisMonth.minutes - lastMonth.minutes}
                format={formatMinutes}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant mb-3">
            Monthly Session Frequency
          </h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySessionFrequencyData}>
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="var(--color-outline)"
                  fontSize={11}
                  interval={4}
                />
                <YAxis stroke="var(--color-outline)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="cumulativeSessions"
                  stroke="var(--color-primary)"
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                  name="Total visits"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant mb-3">
            Success Rate by Grade (%)
          </h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeSuccessRateData} layout="vertical">
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke="var(--color-outline)"
                  fontSize={11}
                  unit="%"
                />
                <YAxis
                  dataKey="grade"
                  type="category"
                  stroke="var(--color-outline)"
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value) => [`${value ?? 0}%`, "Success rate"]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar
                  dataKey="successRate"
                  fill="var(--color-primary-container)"
                  radius={[0, 4, 4, 0]}
                  name="Success rate"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/*
          The chart the wall tags exist to produce. Hidden until something is
          tagged rather than rendered as an empty axis.
        */}
        {wallSuccessRateData.length > 0 && (
          <Card className="p-4 flex flex-col justify-center">
            <h3 className="text-sm font-medium text-on-surface-variant mb-1">
              Success Rate by Wall Angle (%)
            </h3>
            <p className="text-label-sm text-on-surface-variant mb-3">
              A route tagged with two angles counts under both, so these bars do
              not add up to the month.
            </p>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wallSuccessRateData} layout="vertical">
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    stroke="var(--color-outline)"
                    fontSize={11}
                    unit="%"
                  />
                  <YAxis
                    dataKey="wall"
                    type="category"
                    width={80}
                    stroke="var(--color-outline)"
                    fontSize={12}
                  />
                  <Tooltip
                    formatter={(value, _name, item) => [
                      `${value ?? 0}% of ${item?.payload?.tries ?? 0} tries`,
                      "Success rate",
                    ]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Bar
                    dataKey="successRate"
                    fill="var(--color-tertiary)"
                    radius={[0, 4, 4, 0]}
                    name="Success rate"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card className="p-4 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-on-surface-variant">
              Session Activity Heatmap
            </h3>
            <span className="text-xs text-on-surface-variant font-normal">
              Last 30 days
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5 my-auto">
            {stats.daily.map((day) => (
              <div
                key={day.date}
                className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] transition-all ${getTileColor(
                  day.sessions,
                )}`}
                title={`${formatDayMonth(day.date)}: ${pluralize(day.sessions, "session")}`}
              >
                <span className="tabular-nums">{Number(day.date.slice(8))}</span>
                {day.sessions > 1 && (
                  <span className="text-[8px] font-extrabold leading-none">
                    x{day.sessions}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-on-surface-variant">
            <span>Rest</span>
            <div className="w-2.5 h-2.5 rounded bg-surface-container-high/30" />
            <div className="w-2.5 h-2.5 rounded bg-primary/50" />
            <div className="w-2.5 h-2.5 rounded bg-primary/80" />
            <div className="w-2.5 h-2.5 rounded bg-primary" />
            <span>Multi-session</span>
          </div>
        </Card>

        <Card className="p-4 mb-4">
          <h3 className="text-sm font-medium text-on-surface-variant mb-3">
            PERSONAL RECORDS (TOP 3)
          </h3>
          <div className="flex flex-col gap-3">
            {stats.personal_records.length > 0 ? (
              stats.personal_records.map((item) => (
                <div
                  key={item.attempt_id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-high/40 border border-outline-variant/20 hover:border-outline-variant/50 transition-colors"
                >
                  <div className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary font-black text-xl">
                    {item.grade_name}
                  </div>

                  <div className="flex-1 mx-4 flex flex-col justify-center min-w-0">
                    <span className="font-semibold text-sm text-on-surface truncate">
                      {item.route_name || "Unnamed route"}
                    </span>
                    <span className="text-xs text-on-surface-variant truncate">
                      {item.gym_name || "No location name"}
                    </span>
                  </div>

                  <div className="text-right whitespace-nowrap">
                    <span className="text-xs text-on-surface-variant tabular-nums">
                      {formatDate(item.visit_date)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-sm text-on-surface-variant border border-dashed border-outline-variant/40 rounded-xl">
                No sends recorded yet. Keep climbing!
              </div>
            )}
          </div>
        </Card>
      </div>

      <SessionDetail
        session={openSession}
        onClose={() => setOpenSession(null)}
      />
    </div>
  );
};

export default Progress;
