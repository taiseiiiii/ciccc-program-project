import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import type SessionType from "../types/SessionType";
import type { AttemptRecord } from "../types/AttemptType";
import type Goal from "../types/GoalType";
import type { GoalCreate, GoalUpdate } from "../types/GoalType";
import type Grade from "../types/GradeType";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
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

/** Local YYYY-MM for the month `offset` months before the current one. */
const monthKey = (offset: number): string => {
  const d = new Date();
  d.setDate(1); // step back from the 1st so month arithmetic can't overflow
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleDateString("sv-SE").slice(0, 7);
};

const getTileColor = (count: number) => {
  if (count === 0)
    return "bg-surface-container-high/30 text-on-surface-variant/50";
  if (count === 1) return "bg-primary/50 text-on-primary font-medium";
  if (count === 2) return "bg-primary/80 text-on-primary font-bold";
  return "bg-primary text-on-primary font-bold shadow-sm";
};

const Progress = () => {
  const queryClient = useQueryClient();
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [goalDescription, setGoalDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

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

  const goals = goalsData?.data || [];
  const grades = gradesData?.data ?? [];

  const isLoading =
    isSessionsLoading || isAttemptsLoading || isGoalsLoading || isGradesLoading;
  const isError =
    isSessionsError || isAttemptsError || isGoalsError || isGradesError;

  // Goals Update Setting
  const resetGoalForm = () => {
    setSelectedGradeId(null);
    setTargetDate("");
    setGoalDescription("");
    setEditingGoalId(null);
  };

  const createGoalMutation = useMutation<{ data: Goal }, Error, GoalCreate>({
    mutationFn: (newGoal: GoalCreate) =>
      api("/goals", { method: "POST", body: JSON.stringify(newGoal) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });

      toast.success("Goal created successfully!");
      handleCloseModal();
    },
    onError: () => {
      toast.error("Failed to create goal");
    },
  });

  const updateGoalMutation = useMutation<
    { data: Goal },
    Error,
    { goalId: number; updatedGoal: GoalUpdate }
  >({
    mutationFn: ({
      goalId,
      updatedGoal,
    }: {
      goalId: number;
      updatedGoal: GoalUpdate;
    }) =>
      api(`/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify(updatedGoal),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal updated successfully!");
      handleCloseModal();
    },
    onError: (error) => {
      console.error("Failed to update goal:", error);
      toast.error("Failed to update goal");
    },
  });

  const deleteGoalMutation = useMutation<unknown, Error, number>({
    mutationFn: (goalId: number) =>
      api(`/goals/${goalId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal deleted successfully!");
      setIsDeleteConfirmOpen(false);
      handleCloseModal();
    },
    onError: (error) => {
      console.error("Failed to delete goal:", error);
      toast.error("Failed to delete goal");
    },
  });

  const getGradeName = (gradeId: number) => {
    const foundGradeName = grades.find((g) => g.grade_id === gradeId);
    return foundGradeName ? foundGradeName.grade_name : `Grade No.${gradeId}`;
  };

  const handleSaveGoal = () => {
    if (!selectedGradeId) {
      toast.error("Please select a target grade.");
      return;
    }

    if (editingGoalId) {
      const updateGoalData: GoalUpdate = {
        grade_id: selectedGradeId,
        goal_description: goalDescription.trim() || null,
        target_date: targetDate || null,
      };

      updateGoalMutation.mutate({
        goalId: editingGoalId,
        updatedGoal: updateGoalData,
      });
    } else {
      const newGoalData: GoalCreate = {
        grade_id: selectedGradeId,
        goal_description: goalDescription.trim() || null,
        target_date: targetDate || null,
      };

      createGoalMutation.mutate(newGoalData);
    }
  };

  const handleCloseModal = () => {
    setIsGoalModalOpen(false);
    resetGoalForm();
  };

  const handleOpenEditModal = (goal: Goal) => {
    setEditingGoalId(goal.goal_id);
    setSelectedGradeId(goal.grade_id);
    setTargetDate(goal.target_date ?? "");
    setGoalDescription(goal.goal_description ?? "");
    setIsGoalModalOpen(true);
  };

  const handleDeleteGoal = () => {
    if (!editingGoalId) return;
    deleteGoalMutation.mutate(editingGoalId);
  };

  const activeGoals = goals.filter((g) => g.is_achieved === false);
  const sortedActiveGoals = [...activeGoals].sort((a, b) => {
    if (!a.target_date && !b.target_date) return 0;
    if (!a.target_date) return 1;
    if (!b.target_date) return -1;
    return a.target_date.localeCompare(b.target_date);
  });

  // Every figure on the page is derived from the two lists and is pure, so it is
  // memoised: the goal modal's form state lives in this component, and without
  // this each keystroke would re-run every pass over the whole history.
  const {
    currentMonthSendsCount,
    monthSendsDelta,
    highestGradeThisMonth,
    totalAttemptThisMonthCount,
    climbingDaysThisMonthCount,
    climbingDaysDelta,
    monthlySessionFrequencyData,
    gradeSuccessRateData,
    calendarDays,
    personalRecordTop3,
  } = useMemo(() => {
    const sessions = sessionsData?.data ?? [];
    const attempts = attemptsData?.data ?? [];

    const currentMonth = monthKey(0);
    const lastMonth = monthKey(1);

    // An attempt row only carries its insert timestamp, so the month it belongs
    // to comes from its session's visit_date — the day the user says they
    // climbed, which they may backdate, and the basis the climbing-day figures
    // and the server's own aggregates both use.
    const visitDateBySession = new Map(
      sessions.map((session) => [session.session_id, session.visit_date]),
    );
    const monthOf = (attempt: AttemptRecord) =>
      visitDateBySession.get(attempt.session_id)?.slice(0, 7);

    const sendsIn = (month: string) =>
      attempts.filter((a) => a.is_success && monthOf(a) === month);

    const sendsThisMonth = sendsIn(currentMonth);
    const currentMonthSendsCount = sendsThisMonth.length;
    const monthSendsDelta = currentMonthSendsCount - sendsIn(lastMonth).length;

    // Highest grade sent this month (successful attempts only)
    const highestGradeThisMonth =
      sendsThisMonth.length > 0
        ? sendsThisMonth.reduce((best, a) =>
            a.grade_level > best.grade_level ? a : best,
          ).grade_name
        : "-";

    const totalAttemptsThisMonth = attempts.filter(
      (a) => monthOf(a) === currentMonth,
    );
    const totalAttemptThisMonthCount = totalAttemptsThisMonth.length;

    // Climbing days per month
    const climbingDaysIn = (month: string) =>
      new Set(
        sessions
          .filter((s) => s.visit_date?.slice(0, 7) === month)
          .map((s) => s.visit_date),
      ).size;
    const climbingDaysThisMonthCount = climbingDaysIn(currentMonth);
    const climbingDaysDelta =
      climbingDaysThisMonthCount - climbingDaysIn(lastMonth);

    // Monthly session frequency
    const dailyCounts = new Map<string, number>();
    for (const session of sessions) {
      const dateKey = session.visit_date.slice(0, 10);
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) ?? 0) + 1);
    }

    // The page always shows the current month, so the chart runs up to today.
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    const monthlySessionFrequencyData = Array.from(
      { length: today.getDate() },
      (_, i) => {
        const dayNumber = i + 1;
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
        const dateLabel = new Date(
          year,
          month - 1,
          dayNumber,
        ).toLocaleDateString("en-US", { month: "short", day: "numeric" });

        return {
          date: dateLabel,
          sessions: dailyCounts.get(dateKey) ?? 0,
        };
      },
    ).reduce<
      Array<{ date: string; sessions: number; cumulativeSessions: number }>
    >((days, day) => {
      const previous = days[days.length - 1]?.cumulativeSessions ?? 0;
      days.push({ ...day, cumulativeSessions: previous + day.sessions });
      return days;
    }, []);

    // Success rate by grade
    type GradeStat = { sends: number; fails: number };
    const statsMap = new Map<string, GradeStat>();

    for (const attempt of totalAttemptsThisMonth) {
      const grade = attempt.grade_name;
      const current = statsMap.get(grade) ?? { sends: 0, fails: 0 };

      if (attempt.is_success) {
        current.sends += 1;
      } else {
        current.fails += 1;
      }

      statsMap.set(grade, current);
    }
    const gradeSuccessRateData = Array.from(statsMap.entries())
      .map(([grade, { sends, fails }]) => {
        const total = sends + fails;
        const successRate = total > 0 ? Math.round((sends / total) * 100) : 0;

        return { grade, successRate, sends, fails };
      })
      .sort((a, b) =>
        a.grade.localeCompare(b.grade, undefined, { numeric: true }),
      );

    // Session activity heatmap. Every cell is offset from the same `today`, so a
    // render spanning local midnight cannot emit two cells for the same day.
    const calendarDays = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (29 - i));
      const dateKey = d.toLocaleDateString("sv-SE");

      return {
        dateKey,
        dateLabel: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        dayNumber: d.getDate(),
        count: dailyCounts.get(dateKey) ?? 0,
      };
    });

    // Personal records. Only the surviving three are date-formatted.
    const sessionById = new Map(sessions.map((s) => [s.session_id, s]));
    const personalRecordTop3 = attempts
      .filter((a) => a.is_success)
      .sort((a, b) => b.grade_level - a.grade_level)
      .slice(0, 3)
      .map((attempt) => {
        const session = sessionById.get(attempt.session_id);

        return {
          id: attempt.attempt_id,
          grade_name: attempt.grade_name,
          grade_level: attempt.grade_level,
          route_name: attempt.route_name || "Unnamed Route",
          location: session?.gym_name || "No location name",
          // The day it was climbed, not the day it happened to be logged.
          // A bare YYYY-MM-DD parses as UTC, so pin it to local midnight.
          date: session
            ? new Date(`${session.visit_date}T00:00:00`).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )
            : "-",
        };
      });

    return {
      currentMonthSendsCount,
      monthSendsDelta,
      highestGradeThisMonth,
      totalAttemptThisMonthCount,
      climbingDaysThisMonthCount,
      climbingDaysDelta,
      monthlySessionFrequencyData,
      gradeSuccessRateData,
      calendarDays,
      personalRecordTop3,
    };
  }, [sessionsData, attemptsData]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-on-surface-variant animate-pulse">
          Loading analytics data...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-error font-medium">
          Failed to load performance analytics.
        </p>
      </div>
    );
  }

  return (
    <div>
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl border border-outline-variant space-y-4 text-center">
            <h3 className="text-base font-bold text-on-surface">
              Delete Goal
            </h3>
            <p className="text-sm text-on-surface-variant">
              Are you sure you want to delete this goal?
            </p>

            <div className="flex justify-center gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={deleteGoalMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="error"
                onClick={handleDeleteGoal}
                disabled={deleteGoalMutation.isPending}
              >
                {deleteGoalMutation.isPending ? "Deleting..." : "Yes, Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl border border-outline-variant space-y-5">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <h2 className="text-lg font-bold text-on-surface">
                {editingGoalId ? "Edit Goal" : "Set New Goal"}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={handleCloseModal}
                className="text-on-surface-variant hover:text-on-surface cursor-pointer rounded-lg p-1 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Target Grade
                </label>
                {isGradesLoading ? (
                  <div className="text-xs text-on-surface-variant p-2">
                    Loading grades...
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                    {grades.map((grade) => {
                      const isSelected = selectedGradeId === grade.grade_id;
                      return (
                        <button
                          key={grade.grade_id}
                          type="button"
                          onClick={() => setSelectedGradeId(grade.grade_id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isSelected
                              ? "bg-primary text-black font-bold"
                              : "bg-background border border-outline-variant text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {grade.grade_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Target Date
                </label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Description / Memo
                </label>
                <textarea
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder="Send V5 in one month!!"
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              {editingGoalId ? (
                <Button
                  variant="error"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  disabled={deleteGoalMutation.isPending}
                >
                  Delete
                </Button>
              ) : (
                <div></div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveGoal}
                  disabled={
                    createGoalMutation.isPending || updateGoalMutation.isPending
                  }
                >
                  {createGoalMutation.isPending || updateGoalMutation.isPending
                    ? "Saving..."
                    : editingGoalId
                      ? "Update Goal"
                      : "Save Goal"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-primary text-headline-md font-bold tracking-tight mb-4">
        Performance Analytics
      </h1>

      <div>
        <Card className="p-4 mb-6 border border-outline-variant/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">
                Active Goals
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {sortedActiveGoals.length}
              </span>
            </div>

            <Button
              variant="primary"
              onClick={() => setIsGoalModalOpen(true)}
              className="text-xs"
            >
              + Add Goal
            </Button>
          </div>

          <div className="flex flex-col gap-2.5">
            {sortedActiveGoals.length > 0 ? (
              sortedActiveGoals.map((goal) => (
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
                        {goal.goal_description}
                      </span>
                      {goal.target_date && (
                        <span className="text-xs text-on-surface-variant font-mono flex items-center gap-1">
                          Due: {goal.target_date}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => handleOpenEditModal(goal)}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Edit
                    </Button>

                    <Button
                      variant="primary"
                      className="shrink-0 text-xs gap-1 hover:bg-primary hover:text-on-primary border-primary/30"
                      onClick={() => {
                        updateGoalMutation.mutate({
                          goalId: goal.goal_id,
                          updatedGoal: {
                            is_achieved: true,
                          },
                        });
                      }}
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
                  className="text-xs text-primary underline"
                  onClick={() => setIsGoalModalOpen(true)}
                >
                  Set your first climbing goal!
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-4">
        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            TOTAL SENDS / MONTH
          </h3>
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-bold mt-2 text-primary">
              {currentMonthSendsCount}{" "}
              <span className="text-sm font-bold mt-2 text-primary">
                / {totalAttemptThisMonthCount} attempts
              </span>
            </p>
            {monthSendsDelta !== 0 && (
              <p
                className={monthSendsDelta > 0 ? "text-primary" : "text-error"}
              >
                {monthSendsDelta > 0 ? `+${monthSendsDelta}` : monthSendsDelta}{" "}
                from last month
              </p>
            )}
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            HIGHEST GRADE / MONTH
          </h3>
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-bold mt-2 text-error">
              {highestGradeThisMonth}
            </p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-on-surface-variant">
            CLIMBING DAYS / MONTH
          </h3>
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-bold mt-2 text-secondary">
              {climbingDaysThisMonthCount} day
              {climbingDaysThisMonthCount === 1 ? "" : "s"}
            </p>
            {climbingDaysDelta !== 0 && (
              <p
                className={climbingDaysDelta > 0 ? "text-primary" : "text-error"}
              >
                {climbingDaysDelta > 0
                  ? `+${climbingDaysDelta}`
                  : climbingDaysDelta}{" "}
                from last month
              </p>
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
                  <linearGradient
                    id="colorSessions"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
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
                <YAxis stroke="var(--color-outline)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface-container-highest)",
                    borderColor: "var(--color-outline-variant)",
                    borderRadius: "8px",
                    color: "var(--color-on-surface)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeSessions"
                  stroke="var(--color-primary)"
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                  name="Total Visits"
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
                  formatter={(value) => [`${value ?? 0}%`, "Success Rate"]}
                  contentStyle={{
                    backgroundColor: "var(--color-surface-container-highest)",
                    borderColor: "var(--color-outline-variant)",
                    borderRadius: "8px",
                    color: "var(--color-on-surface)",
                  }}
                />
                <Bar
                  dataKey="successRate"
                  fill="var(--color-primary-container)"
                  radius={[0, 4, 4, 0]}
                  name="Success Rate"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

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
            {calendarDays.map((item) => (
              <div
                key={item.dateKey}
                className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] transition-all ${getTileColor(
                  item.count,
                )}`}
                title={`${item.dateLabel}: ${item.count} session${item.count === 1 ? "" : "s"}`}
              >
                <span>{item.dayNumber}</span>
                {item.count > 1 && (
                  <span className="text-[8px] font-extrabold leading-none">
                    x{item.count}
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
            {personalRecordTop3.length > 0 ? (
              personalRecordTop3.map((item, index) => (
                <div
                  key={item.id || index}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-high/40 border border-outline-variant/20 hover:border-outline-variant/50 transition-colors"
                >
                  <div className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary font-black text-xl">
                    {item.grade_name}
                  </div>

                  <div className="flex-1 mx-4 flex flex-col justify-center min-w-0">
                    <span className="font-semibold text-sm text-on-surface truncate">
                      {item.route_name}
                    </span>
                    <span className="text-xs text-on-surface-variant truncate">
                      {item.location}
                    </span>
                  </div>

                  <div className="text-right whitespace-nowrap">
                    <span className="text-xs text-on-surface-variant font-mono">
                      {item.date}
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
    </div>
  );
};

export default Progress;
