import { useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate, formatMinutes, pluralize } from "../lib/date";
import type SessionType from "../types/SessionType";
import type { AttemptRecord } from "../types/AttemptType";
import { isFlash } from "../types/AttemptType";
import type Media from "../types/MediaType";
import Modal from "./Modal";
import MediaGallery from "./MediaGallery";
import Button from "./Button";
import Input from "./Input";
import ClimbEditModal from "./ClimbEditModal";
import ConfirmDialog from "./ConfirmDialog";

interface SessionDetailProps {
  session: SessionType | null;
  onClose: () => void;
}

/** How a logged climb reads back: "Flash", "Sent 1/4", "4 tries". */
function describeResult(climb: AttemptRecord): string {
  if (climb.send_count === 0) return pluralize(climb.attempt_count, "try", "tries");
  if (isFlash(climb)) return "Flash";
  return `Sent ${climb.send_count}/${climb.attempt_count}`;
}

/**
 * One gym visit, in full: what was climbed, how it went, and the photos —
 * and now the place all of that can be corrected.
 *
 * Editing is opt-in per element rather than a mode the whole modal enters. A
 * climber opening a session is usually reading it, so the default stays a clean
 * read; the header edits when asked, and each climb has its own way in.
 */
export default function SessionDetail({ session, onClose }: SessionDetailProps) {
  const queryClient = useQueryClient();
  const sessionId = session?.session_id;

  const [editingHeader, setEditingHeader] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // null with the modal open means "add a climb"; a record means "edit it".
  const [editingClimb, setEditingClimb] = useState<AttemptRecord | null>(null);
  const [climbModalOpen, setClimbModalOpen] = useState(false);

  const { data: attemptsData, isPending: isAttemptsLoading } = useQuery({
    queryKey: ["attempts", { session_id: sessionId }],
    queryFn: () =>
      api<{ data: AttemptRecord[] }>(`/attempts?session_id=${sessionId}`),
    enabled: sessionId !== undefined,
  });

  // One request for the whole visit — the server matches media pinned to the
  // session and to any climb inside it.
  const { data: mediaData } = useQuery({
    queryKey: ["media", { session_id: sessionId }],
    queryFn: () => api<{ data: Media[] }>(`/media?session_id=${sessionId}`),
    enabled: sessionId !== undefined,
  });

  const attempts = attemptsData?.data ?? [];
  const media = mediaData?.data ?? [];
  const mediaByAttempt = new Map<number, Media[]>();
  for (const item of media) {
    if (item.attempt_id === null) continue;
    const list = mediaByAttempt.get(item.attempt_id) ?? [];
    list.push(item);
    mediaByAttempt.set(item.attempt_id, list);
  }

  const refetchMedia = () =>
    queryClient.invalidateQueries({ queryKey: ["media", { session_id: sessionId }] });

  const sends = attempts.reduce((sum, a) => sum + a.send_count, 0);
  const tries = attempts.reduce((sum, a) => sum + a.attempt_count, 0);

  const openClimb = (climb: AttemptRecord | null) => {
    setEditingClimb(climb);
    setClimbModalOpen(true);
  };

  const { mutate: saveHeader, isPending: isSavingHeader } = useMutation({
    mutationFn: (input: {
      visit_date: string;
      gym_name: string;
      duration_minutes: string;
    }) =>
      api(`/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          visit_date: input.visit_date,
          gym_name: input.gym_name.trim() || null,
          // An emptied field means "I never recorded this", which is null —
          // not zero, and not "leave it as it was".
          duration_minutes:
            input.duration_minutes.trim() === ""
              ? null
              : Number(input.duration_minutes),
        }),
      }),
    onSuccess: () => {
      // The date can move a visit into another month, so every stats window is
      // suspect, not just this one's.
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Session updated");
      setEditingHeader(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not save"),
  });

  const { mutate: removeSession, isPending: isDeletingSession } = useMutation({
    mutationFn: () => api(`/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["attempts"] });
      queryClient.invalidateQueries({ queryKey: ["media"] });
      toast.success("Session deleted");
      setConfirmingDelete(false);
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not delete"),
  });

  return (
    <>
      <Modal
        open={session !== null && !climbModalOpen}
        onClose={onClose}
        size="lg"
        title={session ? (session.gym_name ?? "Climbing session") : "Session"}
      >
        {session && (
          <>
            {editingHeader ? (
              <SessionHeaderForm
                session={session}
                isSaving={isSavingHeader}
                onCancel={() => setEditingHeader(false)}
                onSave={saveHeader}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-on-surface-variant">
                  {formatDate(session.visit_date)}
                  {session.duration_minutes !== null &&
                    ` · ${formatMinutes(session.duration_minutes)} on the wall`}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setEditingHeader(true)}
                >
                  Edit details
                </Button>
              </div>
            )}

            {isAttemptsLoading ? (
              <p className="mt-4 text-on-surface-variant animate-pulse">
                Loading climbs...
              </p>
            ) : (
              <>
                <p className="mt-1 text-label-md text-on-surface-variant">
                  {attempts.length === 0
                    ? "No climbs were logged on this visit."
                    : `${pluralize(attempts.length, "route")} · ${sends} sent from ${tries} tries`}
                </p>

                <ul className="flex flex-col gap-3 mt-4 list-none p-0">
                  {attempts.map((climb) => {
                    const tags = [
                      ...climb.wall_types.map((t) => t.label),
                      ...climb.hold_types.map((t) => t.label),
                    ];
                    return (
                      <li
                        key={climb.attempt_id}
                        className="rounded-xl bg-surface-container-high/40 border border-outline-variant/30 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              climb.send_count > 0
                                ? "text-primary bg-primary/10 font-bold px-2.5 py-1 rounded-full text-xs"
                                : "text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded-full text-xs"
                            }
                          >
                            {describeResult(climb)}
                          </span>
                          <span className="font-bold">{climb.grade_name}</span>
                          <span className="truncate">
                            {climb.route_name || "Unnamed route"}
                          </span>
                          <button
                            type="button"
                            onClick={() => openClimb(climb)}
                            className="ml-auto text-label-sm text-primary hover:underline cursor-pointer shrink-0"
                          >
                            Edit
                          </button>
                        </div>

                        {tags.length > 0 && (
                          <p className="text-label-sm text-on-surface-variant mt-1.5">
                            {tags.join(" · ")}
                          </p>
                        )}

                        {climb.weaknesses.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {climb.weaknesses.map((w) => (
                              <span
                                key={w.weakness_type_id}
                                className="px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container text-label-sm"
                              >
                                {w.label}
                              </span>
                            ))}
                          </div>
                        )}

                        {climb.note && (
                          <p className="text-on-surface-variant mt-2 whitespace-pre-line">
                            {climb.note}
                          </p>
                        )}

                        <MediaGallery
                          media={mediaByAttempt.get(climb.attempt_id) ?? []}
                          onChanged={refetchMedia}
                        />
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4">
                  <Button variant="secondary" onClick={() => openClimb(null)}>
                    + Add a climb
                  </Button>
                </div>
              </>
            )}

            {/* Anything pinned to the visit rather than to one climb. */}
            <MediaGallery
              media={media.filter((m) => m.attempt_id === null)}
              onChanged={refetchMedia}
            />

            <div className="mt-6 pt-4 border-t border-outline-variant">
              <Button
                variant="error"
                onClick={() => setConfirmingDelete(true)}
                disabled={isDeletingSession}
              >
                Delete this session
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/*
        Keyed by the climb being edited so the form re-seeds when the climber
        moves from one to another. Without it a second Edit would open showing
        the first climb's values, because the draft state seeds only on mount.
      */}
      {sessionId !== undefined && climbModalOpen && (
        <ClimbEditModal
          key={editingClimb?.attempt_id ?? "new"}
          open
          onClose={() => setClimbModalOpen(false)}
          sessionId={sessionId}
          attempt={editingClimb}
        />
      )}

      <ConfirmDialog
        open={confirmingDelete}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => removeSession()}
        title="Delete this session?"
        message="Every climb logged on this visit, and every photo and video attached to them, is deleted for good."
        confirmLabel="Delete"
        isPending={isDeletingSession}
      />
    </>
  );
}

/** The visit's own fields — where it was, when, and how long. */
function SessionHeaderForm({
  session,
  isSaving,
  onCancel,
  onSave,
}: {
  session: SessionType;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: {
    visit_date: string;
    gym_name: string;
    duration_minutes: string;
  }) => void;
}) {
  const [visitDate, setVisitDate] = useState(session.visit_date);
  const [gymName, setGymName] = useState(session.gym_name ?? "");
  const [duration, setDuration] = useState(
    session.duration_minutes === null ? "" : String(session.duration_minutes),
  );

  return (
    <div className="rounded-xl bg-surface-container-high/40 border border-outline-variant/30 p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          type="text"
          label="Location"
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
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-3 mt-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={isSaving}
          onClick={() =>
            onSave({
              visit_date: visitDate,
              gym_name: gymName,
              duration_minutes: duration,
            })
          }
        >
          {isSaving ? "Saving..." : "Save details"}
        </Button>
      </div>
    </div>
  );
}
