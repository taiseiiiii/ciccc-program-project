import { useState } from "react";
import Button from "./Button";
import Input from "./Input";
import Textarea from "./Textarea";

interface ReportNotesProps {
  initialTitle: string | null;
  initialNote: string | null;
  titlePlaceholder: string;
  notePlaceholder: string;
  isSaving: boolean;
  onSave: (patch: { title: string | null; user_note: string | null }) => void;
  onDelete: () => void;
}

/**
 * The climber's own layer on a saved AI report: a name for it, and what
 * actually happened afterwards.
 *
 * The AI's text is never editable. Looking back at an old report is only worth
 * anything if it still says what it said at the time — so the prediction stays
 * frozen and this sits underneath it, which is what makes "was the coach
 * right?" a question the app can answer.
 *
 * Mount this with `key={reportId}`. The drafts start from props and live in
 * local state, so switching reports remounts the component with the right
 * values instead of needing an effect to copy them across — and a background
 * refetch can never overwrite half-typed text.
 */
export default function ReportNotes({
  initialTitle,
  initialNote,
  titlePlaceholder,
  notePlaceholder,
  isSaving,
  onSave,
  onDelete,
}: ReportNotesProps) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [note, setNote] = useState(initialNote ?? "");

  const isDirty =
    title !== (initialTitle ?? "") || note !== (initialNote ?? "");

  return (
    <div className="mt-4 pt-4 border-t border-outline-variant">
      <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
        Your notes
      </p>
      <Input
        type="text"
        placeholder={titlePlaceholder}
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="mt-2">
        <Textarea
          placeholder={notePlaceholder}
          className="min-h-24"
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex justify-between items-center mt-3">
        <Button variant="error" onClick={onDelete}>
          Delete
        </Button>
        <Button
          disabled={!isDirty || isSaving}
          onClick={() =>
            onSave({
              // Empty means "no note", not an empty string — the column is
              // nullable and the UI checks for null to decide what to show.
              title: title.trim() || null,
              user_note: note.trim() || null,
            })
          }
        >
          {isSaving ? "Saving..." : "Save notes"}
        </Button>
      </div>
    </div>
  );
}
