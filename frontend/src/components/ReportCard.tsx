import type { ReactNode } from "react";
import Card from "./Card";
import ReportNotes from "./ReportNotes";
import { formatDate } from "../lib/date";

interface ReportCardProps {
  /**
   * The report this card is showing. Used as the notes editor's remount key —
   * see the note on `<ReportNotes>` below.
   */
  reportId: number;
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
 */
export default function ReportCard({
  reportId,
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
  const body = paragraphs(detail);

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
            title={isPinned ? "Unpin" : "Pin to the top"}
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
            {aiModel} · generated {formatDate(createdAt)}
          </span>
        </div>
      </div>

      {/* The two lines. Everything else on this card is optional reading. */}
      {summary && (
        <p className="text-on-surface text-headline-sm font-medium mt-3 leading-snug">
          {summary}
        </p>
      )}
      {subtitle && <p className="text-on-surface-variant mt-2">{subtitle}</p>}

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
        The climber's own layer. The AI text above is never editable — comparing
        what it predicted with what happened only works if it still says what it
        said.

        `key` is load-bearing, not decoration. ReportNotes seeds its local draft
        from these props once, so without a key that changes per report,
        switching reports leaves the previous one's half-typed note in the
        boxes — and saving would then write it onto the wrong report.
      */}
      <ReportNotes
        key={reportId}
        initialTitle={initialTitle}
        initialNote={initialNote}
        titlePlaceholder={titlePlaceholder}
        notePlaceholder={notePlaceholder}
        isSaving={isSaving}
        onSave={onSaveNotes}
        onDelete={onDelete}
      />
    </Card>
  );
}
