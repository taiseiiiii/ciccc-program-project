import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { uploadMedia } from "../lib/storage";
import {
  clearSessionDraft,
  readSessionDraft,
  writeSessionDraft,
  type StoredClimb,
} from "../lib/sessionDraft";

import { useAuth } from "../hooks/useAuth";
import { todayString } from "../lib/date";
import Modal from "../components/Modal";
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

/**
 * `crypto.randomUUID()` rather than `Date.now()`: two routes added inside the
 * same millisecond used to share an id, which gave React duplicate keys and
 * pointed the edit modal at whichever one it found first.
 */
const newClimbId = () => crypto.randomUUID();

const emptyClimb = (): DraftClimb => ({
  id: newClimbId(),
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

/**
 * Mirrors the ceiling POST /sessions enforces. Checked here so an out-of-range
 * or fractional duration is caught with a sentence about minutes, instead of
 * coming back as a 400 naming a database column — and, more to the point,
 * without the rest of the visit being thrown away with it.
 */
const MAX_SESSION_MINUTES = 1440;

/** The part of a drafted climb that survives a reload: everything but the files. */
const stripFiles = (climb: DraftClimb): StoredClimb => ({
  id: climb.id,
  grade_name: climb.grade_name,
  route_name: climb.route_name,
  attempt_count: climb.attempt_count,
  send_count: climb.send_count,
  note: climb.note,
  wall_type_ids: climb.wall_type_ids,
  hold_type_ids: climb.hold_type_ids,
  weakness_type_ids: climb.weakness_type_ids,
  weakness_labels: climb.weakness_labels,
});

/** Does this drafted climb hold anything the climber would miss losing? */
const isClimbDirty = (climb: DraftClimb): boolean =>
  climb.route_name.trim() !== "" ||
  climb.note.trim() !== "" ||
  climb.attempt_count !== 1 ||
  climb.send_count !== 0 ||
  climb.wall_type_ids.length > 0 ||
  climb.hold_type_ids.length > 0 ||
  climb.weakness_type_ids.length > 0 ||
  climb.weakness_labels.length > 0 ||
  climb.files.length > 0;

/** How a logged climb reads back: "Flash", "Sent 1/4", "4 tries". */
const describeResult = (climb: AttemptType): string => {
  if (climb.send_count === 0) {
    return `${climb.attempt_count} ${climb.attempt_count === 1 ? "try" : "tries"}`;
  }
  if (climb.attempt_count === 1 && climb.send_count === 1) return "Flash";
  return `Sent ${climb.send_count}/${climb.attempt_count}`;
};

const LogSession = () => {
  const today = todayString();
  const { session } = useAuth();
  // Drafts are stored per account, so the id is part of every call below.
  const userId = session?.user.id ?? "anonymous";

  // Read before the first render, so a visit that was half typed in when the
  // app was closed comes back filled in rather than blank.
  const [restored] = useState(() => readSessionDraft(userId));

  const [visitDate, setVisitDate] = useState<string>(
    restored?.visit_date ?? today,
  );
  const [gymName, setGymName] = useState<string>(restored?.gym_name ?? "");
  const [durationMinutes, setDurationMinutes] = useState<string>(
    restored?.duration_minutes ?? "",
  );
  const [draft, setDraft] = useState<DraftClimb>(() =>
    restored ? { ...restored.draft, files: [] } : emptyClimb(),
  );
  const [climbs, setClimbs] = useState<DraftClimb[]>(() =>
    restored ? restored.climbs.map((climb) => ({ ...climb, files: [] })) : [],
  );
  const [editing, setEditing] = useState<DraftClimb | null>(null);

  // Held so a save blocked on the gym name can put the climber in front of the
  // field instead of relying on a toast that appears at the top of the screen,
  // four seconds long, while they are looking at the button at the bottom.
  const gymNameRef = useRef<HTMLInputElement>(null);

  /** Everything on this screen that is not on the server yet. */
  const hasUnsavedWork =
    climbs.length > 0 ||
    isClimbDirty(draft) ||
    gymName.trim() !== "" ||
    durationMinutes.trim() !== "";

  // Say so, once, when a visit is brought back — and be honest about the files,
  // which are the one part that could not come with it.
  const hasAnnouncedRestore = useRef(false);
  useEffect(() => {
    if (!restored || hasAnnouncedRestore.current) return;
    hasAnnouncedRestore.current = true;

    toast.success(
      restored.climbs.length > 0
        ? `Unsaved session restored — ${restored.climbs.length} route${
            restored.climbs.length === 1 ? "" : "s"
          } still waiting to be saved`
        : "Unsaved session restored",
    );
    if (restored.had_files) {
      toast.error("Photos and videos could not be restored — pick them again");
    }
  }, [restored]);

  // Mirror the form after every change. Nothing here reaches the server until
  // Save Session, so without this a reload, a tab close or a tap on the nav bar
  // silently threw away a whole visit's worth of typing.
  useEffect(() => {
    if (!hasUnsavedWork) {
      clearSessionDraft(userId);
      return;
    }
    writeSessionDraft(userId, {
      visit_date: visitDate,
      gym_name: gymName,
      duration_minutes: durationMinutes,
      draft: stripFiles(draft),
      climbs: climbs.map(stripFiles),
      had_files:
        draft.files.length > 0 ||
        climbs.some((climb) => climb.files.length > 0),
    });
  }, [userId, hasUnsavedWork, visitDate, gymName, durationMinutes, draft, climbs]);

  // Reload and tab-close are the two exits the restore cannot make invisible —
  // staged photos do not survive them — so they still get the browser's warning.
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers only show the prompt when returnValue is set; the string
      // itself has been ignored for years.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedWork]);

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
      // Dashboard and Progress read every figure they show from /stats, keyed
      // by month — the prefix match covers all of them. Without this the totals
      // sit a whole session behind for up to the 60s staleTime.
      queryClient.invalidateQueries({ queryKey: ["stats"] });
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
      // The visit is on the server now, so the local copy has nothing left to
      // protect. (Resetting the fields above would clear it anyway; doing it
      // here keeps the two from drifting apart.)
      clearSessionDraft(userId);

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

    setClimbs([{ ...draft, id: newClimbId() }, ...climbs]);
    setDraft(emptyClimb());
    toast.success("Route added — press Save Session when the visit is done");
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

  /** Refuse the save and take the climber to the field that refused it. */
  const rejectSave = (message: string, field?: HTMLElement | null) => {
    toast.error(message);
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  };

  const handleSaveSession = () => {
    // Checked in the order the form reads, top card first, so fixing one
    // problem does not immediately surface another further up the page.
    //
    // Location is the gate that actually bit people: it is mandatory here
    // (gym_name is nullable in the database — this is a product rule, not a
    // schema one) but it sat unmarked in the same card as "Time on the wall",
    // so a visit typed straight into the route form was refused on a field the
    // climber never knew was required. It reads as "Save did nothing", and the
    // neighbouring blank duration field takes the blame.
    if (!gymName.trim()) {
      rejectSave("Where did you climb? Add the gym to save", gymNameRef.current);
      return;
    }

    // Same rule the API applies: a whole number of minutes, 1..1440. Accepting
    // "1.5" here only to have the server reject the request threw the entire
    // visit away over one field. Blank stays perfectly valid — the column is
    // nullable and always has been.
    const duration =
      durationMinutes.trim() === "" ? undefined : Number(durationMinutes);
    if (
      duration !== undefined &&
      (!Number.isInteger(duration) ||
        duration < 1 ||
        duration > MAX_SESSION_MINUTES)
    ) {
      rejectSave(
        `Time on the wall must be a whole number of minutes, 1–${MAX_SESSION_MINUTES}`,
      );
      return;
    }

    // The route still sitting in the form counts. Saving without it because
    // "Add Route" was never pressed is silent data loss — the climber typed it,
    // so it goes with the visit. It is validated the same way Add Route would
    // have validated it, rather than being dropped on the floor.
    const pending = isClimbDirty(draft) ? draft : null;
    if (pending) {
      if (!pending.route_name.trim()) {
        rejectSave("Name the route still in the form, or clear it, before saving");
        return;
      }
      if (pending.send_count > pending.attempt_count) {
        rejectSave("You cannot send a route more times than you tried it");
        return;
      }
    }
    // Newest first, matching the order Add Route builds the list in.
    const toSave = pending ? [pending, ...climbs] : climbs;

    if (toSave.length === 0) {
      rejectSave("Add at least one route before saving");
      return;
    }
    if (grades.length === 0) {
      // Fetched once with staleTime: Infinity, so a failed load stays failed —
      // say what unsticks it instead of stating the problem.
      rejectSave("Grades have not loaded — tap Retry above, then save again");
      return;
    }

    saveSession({
      visit_date: visitDate,
      gym_name: gymName,
      duration_minutes: duration,
      climbs: toSave,
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
        required
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

      {/*
        Grid, not flex-row: a date input's native spinner fields give it a
        min-content width it refuses to shrink below, so as a flex item it
        pushed the row past the card's edge on narrow screens. Grid tracks
        divide the width up front and the control fits whatever it is given.
      */}
      <Card className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
        <Input
          ref={gymNameRef}
          type="text"
          label="Location"
          required
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

        <div className="flex flex-col items-end">
          <Button className="mt-3" onClick={handleAddClimb}>
            Add Route
          </Button>
          <p className="text-label-sm text-on-surface-variant mt-1.5 text-right">
            Adds it to the list below. The visit itself is saved at the bottom.
          </p>
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
        </div>
      )}

      {/*
        Always on screen, including before the first route is added. Hiding it
        until the list existed is what made "Add Route" read as the save button:
        a climber could add a visit's worth of routes, get a green toast each
        time, and walk away with nothing on their account.
      */}
      <div className="flex flex-col items-end gap-1.5 mt-6">
        <Button onClick={handleSaveSession} disabled={isSavingSession}>
          {isSavingSession ? "Saving..." : "Save Session"}
        </Button>
        <p className="text-label-sm text-on-surface-variant text-right">
          {climbs.length === 0
            ? "Nothing is saved to your account until you press this."
            : `${climbs.length} route${climbs.length === 1 ? "" : "s"} waiting to be saved.`}
        </p>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit route"
        size="lg"
        footer={
          <>
            <Button variant="error" onClick={handleDeleteClimb}>
              Remove route
            </Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateClimb}>Save</Button>
            </div>
          </>
        }
      >
        {editing && (
          <>
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
          </>
        )}
      </Modal>
    </div>
  );
};

export default LogSession;
