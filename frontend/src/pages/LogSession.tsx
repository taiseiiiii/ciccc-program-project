import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

import type AttemptType from "../types/AttemptType";
import type Grade from "../types/GradeType";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";
import Textarea from "../components/Textarea";

const LogSession = () => {
  const today = new Date().toLocaleDateString("sv-SE");
  const [visitDate, setVisitDate] = useState<string>(today);
  const [gymName, setGymName] = useState<string>("");
  const [routeName, setRouteName] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<string>("V0");
  const [climbersNote, setClimbersNote] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [attemptsList, setAttemptsList] = useState<AttemptType[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingAttempt, setEditingAttempt] = useState<null | AttemptType>(
    null,
  );

  const queryClient = useQueryClient();

  const {
    data: gradesData,
    isPending: isGradesLoading,
    isError: isGradesError,
    refetch: refetchGrades,
  } = useQuery({
    queryKey: ["grades"],
    queryFn: () => api<{ data: Grade[] }>("/grades"),
    // Read-only master data (V0–V17): never stale, no background refetches.
    staleTime: Infinity,
  });

  // One request saves the whole visit: POST /sessions accepts the attempts
  // nested and writes session + routes + attempts in a single database
  // transaction, so a failure never leaves a half-saved session behind.
  const { mutate: saveSession, isPending: isSavingSession } = useMutation({
    mutationFn: async (input: {
      visit_date: string;
      gym_name: string;
      grades: Grade[];
      attempts: AttemptType[];
    }) => {
      const attempts = input.attempts.map((attempt) => {
        const grade = input.grades.find(
          (g) => g.grade_name === attempt.grade_name,
        );
        if (!grade) throw new Error(`Unknown grade ${attempt.grade_name}`);
        return {
          grade_id: grade.grade_id,
          route_name: attempt.route_name,
          is_success: attempt.is_success,
          note: attempt.note,
        };
      });

      await api("/sessions", {
        method: "POST",
        body: JSON.stringify({
          visit_date: input.visit_date,
          gym_name: input.gym_name,
          attempts,
        }),
      });
    },
    onSuccess: () => {
      // The dashboard derives its stats from both lists, so a saved session
      // has to refresh the attempts it created as well.
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["attempts"] });
      resetAttemptForm();
      setGymName("");
      setVisitDate(today);
      setAttemptsList([]);
      toast.success("Session successfully saved");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to save session",
      );
    },
  });

  const resetAttemptForm = () => {
    setRouteName("");
    setClimbersNote("");
    setIsSuccess(false);
    setSelectedGrade("V0");
  };

  const handleSaveAttempt = () => {
    if (!routeName.trim()) {
      toast.error("Route Name is empty");
      return;
    }

    const newAttempt = {
      id: Date.now(),
      grade_name: selectedGrade,
      is_success: isSuccess,
      route_name: routeName,
      note: climbersNote,
    };
    setAttemptsList([newAttempt, ...attemptsList]);

    resetAttemptForm();
    toast.success("Attempt saved");
  };

  const handleEditAttempt = (attempt: AttemptType) => {
    setIsEditModalOpen(true);
    setEditingAttempt(attempt);
  };

  const updateEditingField = <K extends keyof AttemptType>(
    field: K,
    value: AttemptType[K],
  ) => {
    if (!editingAttempt) return;
    setEditingAttempt({ ...editingAttempt, [field]: value });
  };

  const handleUpdateAttempt = () => {
    if (!editingAttempt) return;
    const updatedList = attemptsList.map((attempt) =>
      attempt.id === editingAttempt.id ? editingAttempt : attempt,
    );

    setAttemptsList(updatedList);
    setEditingAttempt(null);
    setIsEditModalOpen(false);
    toast.success("Attempt Updated!");
  };

  const handleSaveSession = () => {
    if (!gymName.trim()) {
      toast.error("Not found Location");
      return;
    }

    const grades = gradesData?.data;
    if (!grades) {
      toast.error("Grade data is not loaded yet");
      return;
    }

    saveSession({
      visit_date: visitDate,
      gym_name: gymName,
      grades,
      attempts: attemptsList,
    });
  };

  const handleDeleteAttempt = () => {
    const filteredAttempt = attemptsList.filter(
      (attempt) => attempt.id !== editingAttempt?.id,
    );

    setAttemptsList(filteredAttempt);
    setIsEditModalOpen(false);
    toast.success("Attempt Deleted");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="gap-3">
        <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
          New Performance Entry
        </h1>
        <p>
          Log your latest sends and track your progress through technical
          analytics.
        </p>
        <Card className="flex flex-col md:flex-row gap-3 mt-6">
          <Input
            type="text"
            label="Location"
            placeholder="The hive"
            value={gymName}
            autoCapitalize="words"
            className="capitalize"
            onChange={(e) => setGymName(e.target.value)}
          />
          <Input
            type="date"
            label="Session Date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
          />
        </Card>
        <Card className="mt-3 mb-3">
          <Input
            type="text"
            label="Route Name"
            placeholder="e.g. grade, color, inclination angle"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
          />
          <div className="mt-3">
            <p className="text-label-md text-on-surface-variant mb-2">Result</p>
            <Button
              onClick={() => setIsSuccess(true)}
              className={
                isSuccess
                  ? ""
                  : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              }
            >
              Sent
            </Button>
            <Button
              onClick={() => setIsSuccess(false)}
              className={
                !isSuccess
                  ? ""
                  : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              }
            >
              Attempted
            </Button>
          </div>
          <div className="mt-3">
            <p className="text-label-md text-on-surface-variant mb-2">
              Grades (v-Score)
            </p>
            <div className="flex flex-row gap-2 overflow-x-auto py-2">
              {isGradesLoading && (
                <p className="text-on-surface-variant py-2">
                  Loading grades...
                </p>
              )}
              {isGradesError && (
                <>
                  <p className="text-error self-center">
                    Failed to load grades
                  </p>
                  <Button variant="secondary" onClick={() => refetchGrades()}>
                    Retry
                  </Button>
                </>
              )}
              {gradesData?.data?.map((grade: Grade) => (
                <Button
                  key={grade.grade_id}
                  onClick={() => setSelectedGrade(grade.grade_name)}
                  className={
                    selectedGrade === grade.grade_name
                      ? ""
                      : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                  }
                >
                  {grade.grade_name}
                </Button>
              ))}
            </div>
          </div>
        </Card>
        <div>
          <Card className="w-full">
            <Textarea
              label="Climber's Note"
              placeholder="Describe the feeling, specific bata used or the reason for failure ..."
              className="min-h-30"
              value={climbersNote}
              onChange={(e) => setClimbersNote(e.target.value)}
            />
          </Card>
        </div>
        <div className="flex justify-end">
          <Button className="mt-3" onClick={() => handleSaveAttempt()}>
            Save Attempt
          </Button>
        </div>
      </div>

      {attemptsList.length > 0 && (
        <div className="mt-6">
          <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
            Attempted List
          </h1>
          <div className="flex flex-col gap-3 mt-3">
            {attemptsList?.map((attempt: AttemptType) => (
              <Card
                key={attempt.id}
                className="p-4 flex flex-row items-center justify-between"
              >
                <div className="flex flex-row gap-3">
                  <span
                    className={
                      attempt.is_success
                        ? "text-primary bg-primary/10 font-bold px-2.5 py-1 rounded-full text-xs"
                        : "text-tertiary bg-surface-container-high px-2.5 py-1 rounded-full text-xs"
                    }
                  >
                    {attempt.is_success ? "Sent" : "Attempted"}
                  </span>
                  <p className="font-bold">{attempt.grade_name}</p>
                  <p> - {attempt.route_name}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handleEditAttempt(attempt)}
                >
                  Edit
                </Button>
              </Card>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              className="mt-3"
              onClick={() => handleSaveSession()}
              disabled={isSavingSession}
            >
              {isSavingSession ? "Saving..." : "Save Session"}
            </Button>
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="p-4 gap-3 overflow-y-auto w-full  max-w-lg mx-auto bg-surface max-h-[90vh]">
            <Card className="mt-3 mb-3">
              <h1 className="text-on-surface text-headline-md font-bold tracking-tight mb-5">
                Edit
              </h1>
              <Input
                type="text"
                label="Route Name"
                placeholder="e.g. grade, color, inclination angle"
                value={editingAttempt?.route_name}
                onChange={(e) =>
                  updateEditingField("route_name", e.target.value)
                }
              />
              <div className="mt-3">
                <p className="text-label-md text-on-surface-variant mb-2">
                  Result
                </p>
                <Button
                  onClick={() => updateEditingField("is_success", true)}
                  className={
                    editingAttempt?.is_success
                      ? ""
                      : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                  }
                >
                  Sent
                </Button>
                <Button
                  onClick={() => updateEditingField("is_success", false)}
                  className={
                    editingAttempt?.is_success === false
                      ? ""
                      : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                  }
                >
                  Attempted
                </Button>
              </div>
              <div className="mt-3">
                <p className="text-label-md text-on-surface-variant mb-2">
                  Grades (v-Score)
                </p>
                <div className="flex flex-row gap-2 overflow-x-auto py-2">
                  {gradesData?.data?.map((grade: Grade) => (
                    <Button
                      key={grade.grade_id}
                      onClick={() =>
                        updateEditingField("grade_name", grade.grade_name)
                      }
                      className={
                        editingAttempt?.grade_name === grade.grade_name
                          ? ""
                          : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                      }
                    >
                      {grade.grade_name}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
            <div>
              <Card className="">
                <Textarea
                  label="Climber's Note"
                  placeholder="Describe the feeling, specific bata used or the reason for failure ..."
                  className="min-h-30"
                  value={editingAttempt?.note}
                  onChange={(e) => updateEditingField("note", e.target.value)}
                />
              </Card>
            </div>
            <div className="flex gap-3 justify-between">
              <Button
                variant="error"
                className="mt-3"
                onClick={() => handleDeleteAttempt()}
              >
                Delete
              </Button>
              <div className="mt-3 flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={() => handleUpdateAttempt()}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogSession;
