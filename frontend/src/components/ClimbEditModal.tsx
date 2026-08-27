import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { uploadMedia } from "../lib/storage";
import { useClimbTaxonomies } from "../hooks/useClimbTaxonomies";
import Button from "./Button";
import ClimbFields from "./ClimbFields";
import ConfirmDialog from "./ConfirmDialog";
import FilePicker from "./FilePicker";
import MediaGallery from "./MediaGallery";
import Modal from "./Modal";
import Textarea from "./Textarea";
import type AttemptType from "../types/AttemptType";
import type { AttemptRecord } from "../types/AttemptType";
import type Media from "../types/MediaType";

/**
 * Edit one climb on a session that is already saved, or add one that was
 * forgotten.
 *
 * Both halves of that were missing. A saved visit could only be deleted whole
 * and logged again, which is a poor trade for correcting a grade — and the API
 * had no way at all to add a route to a session after the fact.
 *
 * The form is the same ClimbFields the log screen uses, so a climb corrected
 * here offers exactly the fields it was logged with — photos and video
 * included. Those were the one thing the log screen could take and this could
 * not, so a video forgotten at the gym had nowhere to go afterwards and the
 * ones already attached were invisible here.
 */

interface ClimbEditModalProps {
  open: boolean;
  onClose: () => void;
  /** The session the climb belongs to, or is being added to. */
  sessionId: number;
  /** The climb being edited. Null adds a new one. */
  attempt: AttemptRecord | null;
  /** What is already attached to this climb. Empty while adding one. */
  media: Media[];
  /** Called once an attachment has been added or removed. */
  onMediaChanged: () => void;
}

/** A saved climb, in the shape the draft form works in. */
function toDraft(attempt: AttemptRecord): AttemptType {
  return {
    // The form's key is a client-side draft id; the real one is in the props.
    id: String(attempt.attempt_id),
    grade_name: attempt.grade_name,
    route_name: attempt.route_name ?? "",
    attempt_count: attempt.attempt_count,
    send_count: attempt.send_count,
    note: attempt.note ?? "",
    wall_type_ids: attempt.wall_types.map((t) => t.id),
    hold_type_ids: attempt.hold_types.map((t) => t.id),
    weakness_type_ids: attempt.weaknesses.map((w) => w.weakness_type_id),
    // Anything typed as free text became a weakness row on the way in, so an
    // existing climb has ids only. New labels typed here are sent separately.
    weakness_labels: [],
  };
}

const emptyDraft = (): AttemptType => ({
  id: crypto.randomUUID(),
  grade_name: "V0",
  route_name: "",
  attempt_count: 1,
  send_count: 0,
  note: "",
  wall_type_ids: [],
  hold_type_ids: [],
  weakness_type_ids: [],
  weakness_labels: [],
});

export default function ClimbEditModal({
  open,
  onClose,
  sessionId,
  attempt,
  media,
  onMediaChanged,
}: ClimbEditModalProps) {
  const { t } = useTranslation("sessions");
  const queryClient = useQueryClient();
  const { gradeIdByName } = useClimbTaxonomies();
  const [draft, setDraft] = useState<AttemptType>(() =>
    attempt ? toDraft(attempt) : emptyDraft(),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** Picked here, uploaded once the save below has an attempt id to pin them to. */
  const [files, setFiles] = useState<File[]>([]);

  const update = <K extends keyof AttemptType>(
    field: K,
    value: AttemptType[K],
  ) => setDraft((current) => ({ ...current, [field]: value }));

  /**
   * Everything a climb touches, refreshed together.
   *
   * `stats` matters most and is the least obvious: a corrected grade or send
   * count changes the success rates on Dashboard and Progress, and those read
   * from a different endpoint than the climb does.
   */
  const invalidate = () => {
    for (const key of [["attempts"], ["sessions"], ["stats"], ["media"]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      const gradeId = gradeIdByName(draft.grade_name);
      if (gradeId === undefined) {
        throw new Error(t("climbEdit.error.gradesNotLoaded"));
      }
      if (draft.send_count > draft.attempt_count) {
        throw new Error(t("climbEdit.error.sendsOverTries"));
      }

      const body = {
        grade_id: gradeId,
        route_name: draft.route_name,
        attempt_count: draft.attempt_count,
        send_count: draft.send_count,
        note: draft.note,
        wall_type_ids: draft.wall_type_ids,
        hold_type_ids: draft.hold_type_ids,
        weakness_type_ids: draft.weakness_type_ids,
        weakness_labels: draft.weakness_labels,
      };

      const saved = attempt
        ? await api<{ data: AttemptRecord }>(`/attempts/${attempt.attempt_id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await api<{ data: AttemptRecord }>(`/sessions/${sessionId}/attempts`, {
            method: "POST",
            body: JSON.stringify(body),
          });

      // Only now is there an id to hang a file on — for a climb being added,
      // it does not exist until the request above comes back.
      //
      // Best-effort, the same way the log screen uploads: an edit that saved is
      // saved, and a file storage refuses (the account's quota, a video too
      // long) is reported rather than throwing the correction away with it.
      let failedUploads = 0;
      for (const file of files) {
        try {
          await uploadMedia(file, { attemptId: saved.data.attempt_id });
        } catch {
          failedUploads += 1;
        }
      }
      return { failedUploads };
    },
    onSuccess: ({ failedUploads }) => {
      invalidate();
      // Typed-in weaknesses became saved options — pick them up for next time.
      queryClient.invalidateQueries({ queryKey: ["weaknesses"] });
      onMediaChanged();
      toast.success(
        attempt ? t("climbEdit.toast.updated") : t("climbEdit.toast.added"),
      );
      if (failedUploads > 0) {
        toast.error(t("log.toast.uploadFailed", { count: failedUploads }));
      }
      onClose();
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : t("climbEdit.toast.saveFailed"),
      ),
  });

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: () =>
      api(`/attempts/${attempt!.attempt_id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast.success(t("climbEdit.toast.removed"));
      setConfirmingDelete(false);
      onClose();
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : t("climbEdit.toast.removeFailed"),
      ),
  });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          attempt ? t("climbEdit.editTitle") : t("climbEdit.addTitle")
        }
        size="lg"
        footer={
          <>
            {attempt ? (
              <Button
                variant="error"
                onClick={() => setConfirmingDelete(true)}
                disabled={isDeleting}
              >
                {t("climbEdit.removeClimb")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>
                {t("common:action.cancel")}
              </Button>
              <Button onClick={() => save()} disabled={isSaving}>
                {isSaving
                  ? t("common:action.saving")
                  : t("common:action.save")}
              </Button>
            </div>
          </>
        }
      >
        <ClimbFields climb={draft} update={update} />

        <div className="mt-3">
          <Textarea
            label={t("note.label")}
            placeholder={t("note.placeholder")}
            className="min-h-30"
            maxLength={2000}
            value={draft.note}
            onChange={(e) => update("note", e.target.value)}
          />
        </div>

        {/* What is already on the climb, then a way to add to it. The gallery
            renders nothing at all when there is none, so a climb logged
            without photos just shows the picker. */}
        <MediaGallery media={media} onChanged={onMediaChanged} />
        <FilePicker files={files} onChange={setFiles} />
      </Modal>

      <ConfirmDialog
        open={confirmingDelete}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => remove()}
        title={t("climbEdit.confirmRemove.title")}
        message={t("climbEdit.confirmRemove.message")}
        confirmLabel={t("common:action.remove")}
        isPending={isDeleting}
      />
    </>
  );
}
