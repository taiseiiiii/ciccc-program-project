import { useState } from "react";
import toast from "react-hot-toast";
import type AttemptType from "../types/AttemptType";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type Grades from "../types/Grades";
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
  const { data, isPending, isError } = useQuery<{ data: Grades[] }>({
    queryKey: ["grades"],
    queryFn: () => api("/grades"),
  });

  console.log("Grades data from server:", data);

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
    toast.success("Successfully saved");
  };

  const handleEditAttempt = (attempt: AttemptType) => {
    setIsEditModalOpen(true);
    setEditingAttempt(attempt);
  };

  const updateEditingField = (field: keyof AttemptType, value: any) => {
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

    // mock data will be here
    const saveSessionList = {
      visit_date: visitDate,
      gym_name: gymName,
      attempts: attemptsList,
    };
    console.log(saveSessionList);

    resetAttemptForm();
    setGymName("");
    setVisitDate(today);
    setAttemptsList([]);
    toast.success("Successfully saved");
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
              {data?.data?.map((grade: Grades) => (
                <Button
                  key={grade.grade_id}
                  // key={grade.id ?? `grade-${index}`}
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
            <Button className="mt-3" onClick={() => handleSaveSession()}>
              Save Session
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
                  {data?.data?.map((grade: Grades) => (
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
