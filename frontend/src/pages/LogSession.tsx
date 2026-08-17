import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { uploadMedia } from "../lib/storage";

import type AttemptType from "../types/AttemptType";
import type Grade from "../types/GradeType";
import type TaxonomyTerm from "../types/TaxonomyType";
import type WeaknessType from "../types/WeaknessType";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";
import Textarea from "../components/Textarea";
import TagSelector from "../components/TagSelector";
import Counter from "../components/Counter";
import WeaknessPicker from "../components/WeaknessPicker";

/**
 * A climb being drafted, plus the files staged against it.
 *
 * Files are kept out of AttemptType because they are not part of what gets
 * posted to /sessions — they cannot be uploaded until the save comes back with
 * an attempt_id to attach them to.
 */
interface DraftClimb extends AttemptType {
  files: File[];
}

const emptyClimb = (): DraftClimb => ({
  id: Date.now(),
  grade_name: "V0",
  route_name: "",
  attempt_count: 1,
  send_count: 0,
  note: "",
  wall_type_ids: [],
  hold_type_ids: [],
  weakness_type_ids: [],
  weakness_labels: [],
  files: [],
});

/** How a logged climb reads back: "Flash", "Sent 1/4", "4 tries". */
const describeResult = (climb: AttemptType): string => {
  if (climb.send_count === 0) {
    return `${climb.attempt_count} ${climb.attempt_count === 1 ? "try" : "tries"}`;
  }
  if (climb.attempt_count === 1 && climb.send_count === 1) return "Flash";
  return `Sent ${climb.send_count}/${climb.attempt_count}`;
};

const LogSession = () => {
  const today = new Date().toLocaleDateString("sv-SE");
  const [visitDate, setVisitDate] = useState<string>(today);
  const [gymName, setGymName] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [draft, setDraft] = useState<DraftClimb>(emptyClimb);
  const [climbs, setClimbs] = useState<DraftClimb[]>([]);
  const [editing, setEditing] = useState<DraftClimb | null>(null);

  const queryClient = useQueryClient();

  // Master data. None of it changes while the app is open, so it is fetched
  // once and never refetched — same treatment the grade list already had.
  const masterQuery = { staleTime: Infinity } as const;

  const {
    data: gradesData,
    isPending: isGradesLoading,
    isError: isGradesError,
    refetch: refetchGrades,
  } = useQuery({
    queryKey: ["grades"],
    queryFn: () => api<{ data: Grade[] }>("/grades"),
    ...masterQuery,
  });

  const { data: wallTypesData, isPending: isWallTypesLoading } = useQuery({
    queryKey: ["wall-types"],
    queryFn: () => api<{ data: TaxonomyTerm[] }>("/wall-types"),
    ...masterQuery,
  });

  const { data: holdTypesData, isPending: isHoldTypesLoading } = useQuery({
    queryKey: ["hold-types"],
    queryFn: () => api<{ data: TaxonomyTerm[] }>("/hold-types"),
    ...masterQuery,
  });

  // Not master data: this list grows every time the climber types a new label.
  const { data: weaknessesData, isPending: isWeaknessesLoading } = useQuery({
    queryKey: ["weaknesses"],
    queryFn: () => api<{ data: WeaknessType[] }>("/weaknesses"),
  });

  const grades = gradesData?.data ?? [];
  const wallTypes = wallTypesData?.data ?? [];
  const holdTypes = holdTypesData?.data ?? [];
  const weaknesses = weaknessesData?.data ?? [];

  /**
   * One request saves the whole visit: POST /sessions accepts the climbs
   * nested and writes session + routes + attempts + tags in a single database
   * transaction, so a failure never leaves a half-saved session behind.
   *
   * Photos and videos go up afterwards, because they need the attempt ids the
   * save hands back. They are uploaded best-effort: a session that saved is
   * saved, and a failed photo is reported without throwing the whole thing
   * away.
   */
  const { mutate: saveSession, isPending: isSavingSession } = useMutation({
    mutationFn: async (input: {
      visit_date: string;
      gym_name: string;
      duration_minutes: number | undefined;
      climbs: DraftClimb[];
    }) => {
      const attempts = input.climbs.map((climb) => {
        const grade = grades.find((g) => g.grade_name === climb.grade_name);
        if (!grade) throw new Error(`Unknown grade ${climb.grade_name}`);
        return {
          grade_id: grade.grade_id,
          route_name: climb.route_name,
          attempt_count: climb.attempt_count,
          send_count: climb.send_count,
          note: climb.note,
          wall_type_ids: climb.wall_type_ids,
          hold_type_ids: climb.hold_type_ids,
          weakness_type_ids: climb.weakness_type_ids,
          weakness_labels: climb.weakness_labels,
        };
      });

      const saved = await api<{
        data: { session_id: number; attempts: Array<{ attempt_id: number }> };
      }>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          visit_date: input.visit_date,
          gym_name: input.gym_name,
          duration_minutes: input.duration_minutes,
          attempts,
        }),
      });

      // The server creates attempts in the order they were sent, so the two
      // lists line up index for index.
      let failedUploads = 0;
      for (const [index, climb] of input.climbs.entries()) {
        const attemptId = saved.data.attempts[index]?.attempt_id;
        if (attemptId === undefined) continue;
        for (const file of climb.files) {
          try {
            await uploadMedia(file, { attemptId });
          } catch {
            failedUploads += 1;
          }
        }
      }
      return { failedUploads };
    },
    onSuccess: ({ failedUploads }) => {
      // Dashboard and Progress both derive their figures from these lists, so
      // a saved session has to refresh the climbs it created as well.
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["attempts"] });
      queryClient.invalidateQueries({ queryKey: ["media"] });
      // Typed-in weaknesses became saved options — pick them up for next time.
      queryClient.invalidateQueries({ queryKey: ["weaknesses"] });

      setDraft(emptyClimb());
      setGymName("");
      setDurationMinutes("");
      setVisitDate(today);
      setClimbs([]);

      if (failedUploads > 0) {
        toast.success("Session saved");
        toast.error(
          `${failedUploads} file${failedUploads === 1 ? "" : "s"} could not be uploaded`,
        );
      } else {
        toast.success("Session successfully saved");
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to save session",
      );
    },
  });

  const updateDraft = <K extends keyof DraftClimb>(
    field: K,
    value: DraftClimb[K],
  ) => setDraft((current) => ({ ...current, [field]: value }));

  const updateEditing = <K extends keyof DraftClimb>(
    field: K,
    value: DraftClimb[K],
  ) => setEditing((current) => (current ? { ...current, [field]: value } : current));

  const handleAddClimb = () => {
    if (!draft.route_name.trim()) {
      toast.error("Give the route a name so you can recognise it later");
      return;
    }
    if (draft.send_count > draft.attempt_count) {
      toast.error("You cannot send a route more times than you tried it");
      return;
    }

    setClimbs([{ ...draft, id: Date.now() }, ...climbs]);
    setDraft(emptyClimb());
    toast.success("Route added");
  };

  const handleUpdateClimb = () => {
    if (!editing) return;
    if (editing.send_count > editing.attempt_count) {
      toast.error("You cannot send a route more times than you tried it");
      return;
    }
    setClimbs(climbs.map((c) => (c.id === editing.id ? editing : c)));
    setEditing(null);
    toast.success("Route updated");
  };

  const handleDeleteClimb = () => {
    setClimbs(climbs.filter((c) => c.id !== editing?.id));
    setEditing(null);
    toast.success("Route removed");
  };

  const handleSaveSession = () => {
    if (!gymName.trim()) {
      toast.error("Where did you climb?");
      return;
    }
    if (grades.length === 0) {
      toast.error("Grade data is not loaded yet");
      return;
    }

    const duration = durationMinutes.trim() === "" ? undefined : Number(durationMinutes);
    if (duration !== undefined && (!Number.isFinite(duration) || duration < 1)) {
      toast.error("Session length must be a number of minutes");
      return;
    }

    saveSession({
      visit_date: visitDate,
      gym_name: gymName,
      duration_minutes: duration,
      climbs,
    });
  };

  /** The route form, shared by the new-climb card and the edit modal. */
  const renderClimbFields = (
    climb: DraftClimb,
    update: <K extends keyof DraftClimb>(field: K, value: DraftClimb[K]) => void,
  ) => (
    <>
      <Input
        type="text"
        label="Route Name"
        placeholder="e.g. yellow overhang by the door"
        value={climb.route_name}
        onChange={(e) => update("route_name", e.target.value)}
      />

      <div className="mt-3">
        <p className="text-label-md text-on-surface-variant mb-2">
          Grade (V-scale)
        </p>
        <div className="flex flex-row gap-2 overflow-x-auto py-2">
          {isGradesLoading && (
            <p className="text-on-surface-variant py-2">Loading grades...</p>
          )}
          {isGradesError && (
            <>
              <p className="text-error self-center">Failed to load grades</p>
              <Button variant="secondary" onClick={() => refetchGrades()}>
                Retry
              </Button>
            </>
          )}
          {grades.map((grade) => (
            <Button
              key={grade.grade_id}
              onClick={() => update("grade_name", grade.grade_name)}
              className={
                climb.grade_name === grade.grade_name
                  ? ""
                  : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              }
            >
              {grade.grade_name}
            </Button>
          ))}
        </div>
      </div>

      {/*
        The counts replace the old Sent/Attempted toggle. One row per route
        instead of one row per try: working a project eight times is an 8 here,
        not eight trips through this form.
      */}
      <div className="flex gap-3 mt-3">
        <Counter
          label="Tries"
          value={climb.attempt_count}
          min={1}
          onChange={(next) => update("attempt_count", next)}
        />
        <Counter
          label="Sends"
          value={climb.send_count}
          max={climb.attempt_count}
          emphasis
          onChange={(next) => update("send_count", next)}
          hint={
            climb.attempt_count === 1 && climb.send_count === 1
              ? "Flash!"
              : undefined
          }
        />
      </div>

      <TagSelector
        label="Wall type"
        options={wallTypes.map((w) => ({ id: w.id, label: w.label }))}
        value={climb.wall_type_ids}
        onChange={(next) => update("wall_type_ids", next)}
        isLoading={isWallTypesLoading}
      />

      <TagSelector
        label="Hold types"
        options={holdTypes.map((h) => ({ id: h.id, label: h.label }))}
        value={climb.hold_type_ids}
        onChange={(next) => update("hold_type_ids", next)}
        isLoading={isHoldTypesLoading}
      />

      <WeaknessPicker
        options={weaknesses}
        selectedIds={climb.weakness_type_ids}
        customLabels={climb.weakness_labels}
        onChangeIds={(next) => update("weakness_type_ids", next)}
        onChangeLabels={(next) => update("weakness_labels", next)}
        isLoading={isWeaknessesLoading}
      />
    </>
  );

  /** Staged files for one climb. Uploaded only once the session is saved. */
  const renderFilePicker = (
    climb: DraftClimb,
    update: <K extends keyof DraftClimb>(field: K, value: DraftClimb[K]) => void,
  ) => (
    <div className="mt-3">
      <p className="text-label-md text-on-surface-variant mb-2">
        Photos & video
      </p>
      <input
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          update("files", [...climb.files, ...picked]);
          // Clear the input so re-picking the same file fires onChange again.
          e.target.value = "";
        }}
        className="block w-full text-body-sm text-on-surface-variant file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-surface-container-high file:text-on-surface file:cursor-pointer"
      />
      {climb.files.length > 0 && (
        <ul className="flex flex-col gap-1 mt-2">
          {climb.files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between gap-2 text-body-sm text-on-surface-variant"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() =>
                  update(
                    "files",
                    climb.files.filter((_, index) => index !== i),
                  )
                }
                className="cursor-pointer hover:text-on-surface shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-label-sm text-on-surface-variant mt-1.5">
        Photos are shrunk before upload. Videos: 60s or so, 50 MB max.
      </p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
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
          placeholder="The Hive"
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
        <Input
          type="number"
          inputMode="numeric"
          label="Time on the wall (min)"
          placeholder="90"
          min={1}
          max={1440}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
        />
      </Card>

      <Card className="mt-3 mb-3">
        {renderClimbFields(draft, updateDraft)}

        <div className="mt-3">
          <Textarea
            label="Climber's Note"
            placeholder="Describe the feeling, the beta you used, or why it didn't go..."
            className="min-h-30"
            value={draft.note}
            onChange={(e) => updateDraft("note", e.target.value)}
          />
        </div>

        {renderFilePicker(draft, updateDraft)}

        <div className="flex justify-end">
          <Button className="mt-3" onClick={handleAddClimb}>
            Add Route
          </Button>
        </div>
      </Card>

      {climbs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-on-surface text-headline-sm font-bold tracking-tight">
            This session — {climbs.length} route{climbs.length === 1 ? "" : "s"}
          </h2>
          <div className="flex flex-col gap-3 mt-3">
            {climbs.map((climb) => (
              <Card
                key={climb.id}
                className="p-4 flex flex-row items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-row items-center gap-3 flex-wrap">
                    <span
                      className={
                        climb.send_count > 0
                          ? "text-primary bg-primary/10 font-bold px-2.5 py-1 rounded-full text-xs"
                          : "text-tertiary bg-surface-container-high px-2.5 py-1 rounded-full text-xs"
                      }
                    >
                      {describeResult(climb)}
                    </span>
                    <p className="font-bold">{climb.grade_name}</p>
                    <p className="truncate">{climb.route_name}</p>
                  </div>
                  {(climb.wall_type_ids.length > 0 ||
                    climb.hold_type_ids.length > 0 ||
                    climb.files.length > 0) && (
                    <p className="text-label-sm text-on-surface-variant truncate">
                      {[
                        ...climb.wall_type_ids.map(
                          (id) => wallTypes.find((w) => w.id === id)?.label,
                        ),
                        ...climb.hold_type_ids.map(
                          (id) => holdTypes.find((h) => h.id === id)?.label,
                        ),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {climb.files.length > 0 &&
                        ` · ${climb.files.length} file${climb.files.length === 1 ? "" : "s"}`}
                    </p>
                  )}
                </div>
                <Button variant="secondary" onClick={() => setEditing(climb)}>
                  Edit
                </Button>
              </Card>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              className="mt-3"
              onClick={handleSaveSession}
              disabled={isSavingSession}
            >
              {isSavingSession ? "Saving..." : "Save Session"}
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-xl p-4">
            <h2 className="text-on-surface text-headline-sm font-bold tracking-tight mb-4">
              Edit route
            </h2>

            {renderClimbFields(editing, updateEditing)}

            <div className="mt-3">
              <Textarea
                label="Climber's Note"
                placeholder="Describe the feeling, the beta you used, or why it didn't go..."
                className="min-h-30"
                value={editing.note}
                onChange={(e) => updateEditing("note", e.target.value)}
              />
            </div>

            {renderFilePicker(editing, updateEditing)}

            <div className="flex gap-3 justify-between mt-4">
              <Button variant="error" onClick={handleDeleteClimb}>
                Delete
              </Button>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateClimb}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogSession;
