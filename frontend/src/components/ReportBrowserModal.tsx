import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate } from "../lib/date";
import Button from "./Button";
import Modal from "./Modal";

/**
 * Look back through past reports without losing the one on screen.
 *
 * Choosing an old report used to swap the data inside the card you were
 * reading, which made comparing this month with a previous one a matter of
 * clicking back and forth and remembering. The current report stays mounted
 * behind this; browsing happens here.
 *
 * Two levels: a list of everything, and one report opened in place to read.
 * The full-fidelity rendering — charts, drills, stat rows — stays the card's
 * job, so "Open in page" hands the choice back rather than reimplementing it.
 */

const PAGE_SIZE = 20;

/** What this modal needs of a report. Performances and plans both provide it. */
export interface BrowsableReport {
  id: number;
  title: string | null;
  createdAt: string;
  isPinned: boolean;
  /** "Monthly · August 2026", or nothing for a plan. */
  periodLabel?: string;
  /** The report's own opening line, for the row and the read view. */
  summary?: string;
  /** The long-form text, shown when a row is opened. */
  detail: string | null;
  note: string | null;
}

interface ReportBrowserModalProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The endpoint to page through, e.g. "/performances". */
  endpoint: string;
  /** Turns one API row into the shape above. */
  toReport: (row: T) => BrowsableReport;
  /** Extra filter buttons, e.g. Daily / Monthly. Value goes into the query. */
  extraFilters?: { label: string; param: string; value: string }[];
  /** Show this report in the page behind, and close. */
  onOpenReport: (id: number) => void;
  /** Pin or unpin from inside the browser. */
  onTogglePin: (report: BrowsableReport) => void;
}

/**
 * Generic in the row type so `toReport` is checked against the API shape it
 * actually receives — performances and plans have different columns, and the
 * mapper is the only place that difference is handled.
 */
export default function ReportBrowserModal<T>({
  open,
  onClose,
  title,
  endpoint,
  toReport,
  extraFilters = [],
  onOpenReport,
  onTogglePin,
}: ReportBrowserModalProps<T>) {
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [extra, setExtra] = useState<string | null>(null);
  const [reading, setReading] = useState<BrowsableReport | null>(null);

  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [endpoint, "browser", { pinnedOnly, extra }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      if (pinnedOnly) params.set("is_pinned", "true");
      if (extra) {
        const filter = extraFilters.find((f) => f.value === extra);
        if (filter) params.set(filter.param, filter.value);
      }
      return api<{ data: T[]; meta: { total: number } }>(
        `${endpoint}?${params}`,
      );
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
      return loaded < lastPage.meta.total ? loaded : undefined;
    },
    // Nothing is fetched until the climber opens the browser — this is an
    // archive, not something the coach screen needs on load.
    enabled: open,
  });

  const reports = data?.pages.flatMap((page) => page.data.map(toReport)) ?? [];
  const total = data?.pages[0]?.meta.total ?? 0;

  const close = () => {
    setReading(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="2xl"
      title={reading ? (reading.title ?? formatDate(reading.createdAt)) : title}
      footer={
        reading ? (
          <>
            <Button variant="secondary" onClick={() => setReading(null)}>
              ← Back to list
            </Button>
            <Button
              onClick={() => {
                onOpenReport(reading.id);
                close();
              }}
            >
              Open in page
            </Button>
          </>
        ) : (
          <>
            <span className="text-label-md text-on-surface-variant">
              {total === 0
                ? ""
                : `${reports.length} of ${total} shown`}
            </span>
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </>
        )
      }
    >
      {reading ? (
        <ReadView report={reading} onTogglePin={() => onTogglePin(reading)} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="All"
              active={!pinnedOnly && extra === null}
              onClick={() => {
                setPinnedOnly(false);
                setExtra(null);
              }}
            />
            <FilterChip
              label="★ Pinned"
              active={pinnedOnly}
              onClick={() => setPinnedOnly((on) => !on)}
            />
            {extraFilters.map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                active={extra === filter.value}
                onClick={() =>
                  setExtra((current) =>
                    current === filter.value ? null : filter.value,
                  )
                }
              />
            ))}
          </div>

          {isPending ? (
            <p className="text-on-surface-variant animate-pulse">Loading...</p>
          ) : isError ? (
            <p className="text-error">Could not load your reports.</p>
          ) : reports.length === 0 ? (
            <p className="text-on-surface-variant">
              {pinnedOnly
                ? "You have not pinned any reports yet. The star on a report keeps it at the top of this list."
                : "No reports here yet."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 list-none p-0">
              {reports.map((report) => (
                <li key={report.id}>
                  <button
                    type="button"
                    onClick={() => setReading(report)}
                    className="w-full text-left rounded-xl bg-surface-container-high/40 border border-outline-variant/30 p-3 cursor-pointer hover:bg-surface-container-high/70"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {report.isPinned && (
                        <span className="text-primary" aria-label="Pinned">
                          ★
                        </span>
                      )}
                      <span className="font-bold truncate">
                        {report.title ?? formatDate(report.createdAt)}
                      </span>
                      {report.periodLabel && (
                        <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-full text-xs uppercase tracking-wide">
                          {report.periodLabel}
                        </span>
                      )}
                      <span className="ml-auto text-label-sm text-on-surface-variant shrink-0">
                        {formatDate(report.createdAt)}
                      </span>
                    </span>
                    {report.summary && (
                      <span className="block text-on-surface-variant text-body-sm mt-1.5 line-clamp-2">
                        {report.summary}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-label-md cursor-pointer transition-colors ${
        active
          ? "bg-primary text-on-primary"
          : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
      }`}
    >
      {label}
    </button>
  );
}

/** One report, read-only. Text and the climber's note — no charts. */
function ReadView({
  report,
  onTogglePin,
}: {
  report: BrowsableReport;
  onTogglePin: () => void;
}) {
  const body = (report.detail ?? "")
    .split(/\n{2,}/)
    .filter((p) => p.trim() !== "");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-on-surface-variant text-label-md">
          {report.periodLabel ? `${report.periodLabel} · ` : ""}
          generated {formatDate(report.createdAt)}
        </span>
        <button
          type="button"
          aria-pressed={report.isPinned}
          title={report.isPinned ? "Unpin" : "Pin to the top"}
          onClick={onTogglePin}
          className={`cursor-pointer text-lg leading-none ${
            report.isPinned
              ? "text-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {report.isPinned ? "★" : "☆"}
        </button>
      </div>

      {report.summary && (
        <p className="text-on-surface text-headline-sm font-medium leading-snug">
          {report.summary}
        </p>
      )}

      {body.map((text, i) => (
        <p key={i} className="text-on-surface-variant">
          {text}
        </p>
      ))}

      {report.note && (
        <div className="pt-4 border-t border-outline-variant">
          <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
            Your notes
          </p>
          <p className="whitespace-pre-line">{report.note}</p>
        </div>
      )}
    </>
  );
}
