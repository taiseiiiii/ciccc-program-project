import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate, formatMinutes } from "../lib/date";
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
import ShareSheet from "./ShareSheet";
import { climbSubject, sessionSubject } from "../lib/share/buildSubject";
import type { ShareTemplate } from "../lib/share/types";

interface SessionDetailProps {
  session: SessionType | null;
  onClose: () => void;
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
  const { t } = useTranslation("sessions");
  const queryClient = useQueryClient();
  const sessionId = session?.session_id;

  /** How a logged climb reads back: "Flash", "Sent 1/4", "4 tries". */
  const describeResult = (climb: AttemptRecord): string => {
    if (climb.send_count === 0) {
      return t("common:climb.tries", { count: climb.attempt_count });
    }
    if (isFlash(climb)) return t("common:climb.flash");
    return t("common:climb.sentOf", {
      sends: climb.send_count,
      tries: climb.attempt_count,
    });
  };

  const [editingHeader, setEditingHeader] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // null with the modal open means "add a climb"; a record means "edit it".
  const [editingClimb, setEditingClimb] = useState<AttemptRecord | null>(null);
  const [climbModalOpen, setClimbModalOpen] = useState(false);
  // The climb being shared, or null for the visit as a whole. A separate piece
  // of state from `editingClimb` because sharing and editing are different
  // intents on the same row, and sharing must not open the editor behind it.
  const [sharing, setSharing] = useState<
    { template: ShareTemplate; climb: AttemptRecord | null } | null
  >(null);

  // This component stays mounted between visits — the pages render it with a
  // `session` of null rather than unmounting it — so none of the state above
  // resets on its own. Left alone, an editor opened on one visit reappears over
  // the next one, still pointing at the climb it was opened for.
  //
  // Adjusted during render rather than in an effect, which is what React asks
  // for when state has to follow a prop: the reset lands in the same pass as
  // the change, so nothing renders the old visit's editor even for a frame.
  const [shownSessionId, setShownSessionId] = useState(sessionId);
  if (sessionId !== shownSessionId) {
    setShownSessionId(sessionId);
    setClimbModalOpen(false);
    setEditingClimb(null);
    setEditingHeader(false);
    setSharing(null);
  }

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
      toast.success(t("detail.toast.updated"));
      setEditingHeader(false);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : t("detail.toast.saveFailed"),
      ),
  });

  const { mutate: removeSession, isPending: isDeletingSession } = useMutation({
    mutationFn: () => api(`/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["attempts"] });
      queryClient.invalidateQueries({ queryKey: ["media"] });
      toast.success(t("detail.toast.deleted"));
      setConfirmingDelete(false);
      onClose();
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : t("detail.toast.deleteFailed"),
      ),
  });

  return (
    <>
      {/*
        Left open behind the climb editor rather than hidden while it is up.
        `showModal()` puts each dialog in the top layer and makes everything
        under it inert, so they stack correctly and Escape only ever closes the
        top one — the same way the delete confirmation below already sits over
        this. Hiding it instead read as the whole modal vanishing on Edit.
      */}
      <Modal
        open={session !== null}
        onClose={onClose}
        size="lg"
        title={
          session
            ? (session.gym_name ?? t("common:climb.climbingSession"))
            : t("detail.fallbackTitle")
        }
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
                    ` · ${t("detail.onTheWall", {
                      duration: formatMinutes(session.duration_minutes),
                    })}`}
                </p>
                <div className="flex gap-2">
                  {/* Named for what it shares. Two buttons both reading
                      "Share" — one here, one per climb — left no way to tell
                      which was which; the climb rows keep the bare word
                      because the row they sit in already says. */}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setSharing({ template: "session", climb: null })
                    }
                  >
                    {t("share:entry.session")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setEditingHeader(true)}
                  >
                    {t("detail.editDetails")}
                  </Button>
                </div>
              </div>
            )}

            {isAttemptsLoading ? (
              <p className="mt-4 text-on-surface-variant animate-pulse">
                {t("detail.loadingClimbs")}
              </p>
            ) : (
              <>
                <p className="mt-1 text-label-md text-on-surface-variant">
                  {attempts.length === 0
                    ? t("detail.noClimbs")
                    : `${t("common:climb.routes", {
                        count: attempts.length,
                      })} · ${t("detail.sentFromTries", { sends, tries })}`}
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
                            {climb.route_name || t("common:climb.unnamedRoute")}
                          </span>
                          <span className="ml-auto flex gap-3 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setSharing({ template: "climb", climb })
                              }
                              className="text-label-sm text-primary hover:underline cursor-pointer"
                            >
                              {t("share:title")}
                            </button>
                            <button
                              type="button"
                              onClick={() => openClimb(climb)}
                              className="text-label-sm text-primary hover:underline cursor-pointer"
                            >
                              {t("common:action.edit")}
                            </button>
                          </span>
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
                    {t("detail.addClimb")}
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
                {t("detail.deleteSession")}
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
          // Read from the visit's one media request rather than fetched again
          // inside the editor, so a photo deleted in there disappears from the
          // row behind it in the same pass.
          media={
            editingClimb ? (mediaByAttempt.get(editingClimb.attempt_id) ?? []) : []
          }
          onMediaChanged={refetchMedia}
        />
      )}

      {/*
        Mounted only while sharing, and keyed by what is being shared, so the
        sheet re-seeds its format and chosen video per subject. A sheet left
        mounted would carry the previous climb's video over to the next one —
        the overlay right, the footage wrong, and nothing on screen saying so.
      */}
      {session && sharing && (
        <ShareSheet
          key={sharing.climb?.attempt_id ?? "session"}
          open
          onClose={() => setSharing(null)}
          subject={
            sharing.climb
              ? climbSubject(sharing.climb, session)
              : sessionSubject(session, attempts)
          }
          inAppMedia={
            sharing.climb
              ? (mediaByAttempt.get(sharing.climb.attempt_id) ?? [])
              : media
          }
        />
      )}

      <ConfirmDialog
        open={confirmingDelete}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => removeSession()}
        title={t("detail.confirmDelete.title")}
        message={t("detail.confirmDelete.message")}
        confirmLabel={t("common:action.delete")}
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
  const { t } = useTranslation("sessions");
  const [visitDate, setVisitDate] = useState(session.visit_date);
  const [gymName, setGymName] = useState(session.gym_name ?? "");
  const [duration, setDuration] = useState(
    session.duration_minutes === null ? "" : String(session.duration_minutes),
  );

  return (
    <div className="rounded-xl bg-surface-container-high/40 border border-outline-variant/30 p-3">
      {/* Two columns, never three. Same floor as the log screen's card — a date
          input wants about 167px — but this form sits inside a `max-w-lg`
          modal, so its width does not grow with the viewport: a third track
          would be 147px at every size, not just at `md`. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          type="text"
          label={t("field.gym")}
          value={gymName}
          autoCapitalize="words"
          className="capitalize"
          onChange={(e) => setGymName(e.target.value)}
        />
        <Input
          type="date"
          label={t("field.date")}
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
        />
        <Input
          type="number"
          inputMode="numeric"
          label={t("field.duration")}
          placeholder="90"
          min={1}
          max={1440}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-3 mt-3">
        <Button variant="secondary" onClick={onCancel}>
          {t("common:action.cancel")}
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
          {isSaving ? t("common:action.saving") : t("detail.saveDetails")}
        </Button>
      </div>
    </div>
  );
}
