import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import Card from "./Card";
import Input from "./Input";
import Textarea from "./Textarea";
import ReportLanguageNotice from "./ReportLanguageNotice";
import { formatTimestamp } from "../lib/date";

interface ReportCardProps {
  /** The pill in the top-left — "monthly report · August 2026", "Training plan". */
  label: string;
  /** Model name and generation date, shown small in the corner. */
  aiModel: string | null;
  createdAt: string;
  isPinned: boolean;
  onTogglePin: () => void;

  /** The two lines the card leads with. */
  summary?: string;
  /** The one-line follow-up under the summary. */
  subtitle?: ReactNode;

  /** Everything specific to this kind of report — charts, drills, stat rows. */
  children?: ReactNode;

  /** Long-form text, shown behind a disclosure. */
  detail: string | null;
  isDetailOpen: boolean;
  onToggleDetail: () => void;
  showLabel: string;
  hideLabel: string;

  titlePlaceholder: string;
  notePlaceholder: string;
  initialTitle: string | null;
  initialNote: string | null;
  isSaving: boolean;
  onSaveNotes: (patch: { title: string | null; user_note: string | null }) => void;
  onDelete: () => void;
}

/** Split plain-text report into paragraphs for rendering. */
function paragraphs(text: string | null): string[] {
  return (text ?? "").split(/\n{2,}/).filter((p) => p.trim() !== "");
}

/**
 * One saved AI report — a performance analysis or a training plan.
 *
 * The two used to be about 180 near-identical lines each in AICoach.tsx: same
 * pin star, same model-and-date line, same summary, same collapsible
 * long-form disclosure, same notes footer. Only the middle differs, so that
 * part is `children` and everything around it is shared. Behaviour that used to
 * be duplicated is now identical by construction.
 *
 * **Mount this with `key={reportId}`.** The title and note drafts start from
 * props and live in local state, so switching reports has to remount the card
 * to reseed them. Without that key the previous report's half-typed note stays
 * in the boxes, and saving writes it onto the wrong report. The key used to sit
 * on an inner notes component; it moved out here when the title did.
 */
export default function ReportCard({
  label,
  aiModel,
  createdAt,
  isPinned,
  onTogglePin,
  summary,
  subtitle,
  children,
  detail,
  isDetailOpen,
  onToggleDetail,
  showLabel,
  hideLabel,
  titlePlaceholder,
  notePlaceholder,
  initialTitle,
  initialNote,
  isSaving,
  onSaveNotes,
  onDelete,
}: ReportCardProps) {
  const { t } = useTranslation("coach");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const body = paragraphs(detail);

  const isDirty = title !== (initialTitle ?? "") || note !== (initialNote ?? "");

  const save = () =>
    onSaveNotes({
      // Empty means "no note", not an empty string — the column is nullable and
      // the UI checks for null to decide what to show.
      title: title.trim() || null,
      user_note: note.trim() || null,
    });

  return (
    <Card className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-primary bg-primary/10 font-bold px-2.5 py-1 rounded-full text-xs uppercase tracking-wide">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={isPinned}
            title={isPinned ? t("pin.unpin") : t("pin.pin")}
            onClick={onTogglePin}
            className={`cursor-pointer text-lg leading-none ${
              isPinned
                ? "text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {isPinned ? "★" : "☆"}
          </button>
          <span className="text-on-surface-variant text-xs">
            {t("card.modelGenerated", {
              model: aiModel ?? "",
              date: formatTimestamp(createdAt),
            })}
          </span>
        </div>
      </div>

      {/*
        Naming a report is what makes an archive of them navigable — the browser
        lists reports by their title, falling back to a date. At the bottom of
        the card, below the charts and a collapsed essay, nobody found it, so
        every report was called "Aug 19, 2026". Here it reads as what it is: the
        heading of the thing you are looking at.
      */}
      <div className="mt-3">
        <Input
          type="text"
          label={t("card.nameLabel")}
          placeholder={titlePlaceholder}
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* The two lines. Everything else on this card is optional reading. */}
      {summary && (
        <p className="text-on-surface text-headline-sm font-medium mt-3 leading-snug">
          {summary}
        </p>
      )}
      {subtitle && <p className="text-on-surface-variant mt-2">{subtitle}</p>}

      {/*
        Above the charts rather than inside the disclosure: by the time someone
        has opened the essay and found it in the wrong language, the notice is
        an explanation for something that already went wrong.
      */}
      <ReportLanguageNotice text={[summary, detail].filter(Boolean).join("\n")} />

      {children}

      {body.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onToggleDetail}
            className="text-primary text-label-md hover:underline cursor-pointer"
          >
            {isDetailOpen ? hideLabel : showLabel}
          </button>
          {isDetailOpen &&
            body.map((text, i) => (
              <p key={i} className="mt-3">
                {text}
              </p>
            ))}
        </div>
      )}

      {/*
        What actually happened, written afterwards. The AI text above is never
        editable — comparing what it predicted with what happened only works if
        it still says what it said.
      */}
      <div className="mt-4 pt-4 border-t border-outline-variant">
        <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
          {t("card.yourNotes")}
        </p>
        <Textarea
          placeholder={notePlaceholder}
          className="min-h-24"
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex justify-between items-center mt-3">
          <Button variant="error" onClick={onDelete}>
            {t("common:action.delete")}
          </Button>
          <Button disabled={!isDirty || isSaving} onClick={save}>
            {isSaving ? t("common:action.saving") : t("card.saveNotes")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
