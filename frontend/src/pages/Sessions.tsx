import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate, formatMinutes } from "../lib/date";
import { useClimbTaxonomies } from "../hooks/useClimbTaxonomies";
import type { SessionSummary } from "../types/SessionType";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import SessionDetail from "../components/SessionDetail";

/**
 * Every visit the climber has logged, searchable.
 *
 * The app could show the five most recent and nothing else — a season's worth
 * of climbing existed in the database and in the aggregate figures, but there
 * was no way to look at any of it. This is also the only screen from which an
 * older session can be opened and corrected.
 */

const PAGE_SIZE = 20;

/** Wait for a pause in typing before asking the server. */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

interface SessionPage {
  data: SessionSummary[];
  meta: { total: number };
}

export default function Sessions() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [openSession, setOpenSession] = useState<SessionSummary | null>(null);

  const { grades } = useClimbTaxonomies();
  const debouncedSearch = useDebounced(search);

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    // Every filter is part of the key, so changing one starts a fresh list
    // rather than appending a differently-filtered page to the one on screen.
    queryKey: ["sessions", { q: debouncedSearch, from, to, gradeId }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (gradeId) params.set("grade_id", gradeId);
      return api<SessionPage>(`/sessions?${params}`);
    },
    // The next offset, or nothing when the pages so far already cover the
    // total the server reported.
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
      return loaded < lastPage.meta.total ? loaded : undefined;
    },
  });

  const sessions = data?.pages.flatMap((page) => page.data) ?? [];
  const total = data?.pages[0]?.meta.total ?? 0;
  const hasFilters = Boolean(debouncedSearch.trim() || from || to || gradeId);

  const clearFilters = () => {
    setSearch("");
    setFrom("");
    setTo("");
    setGradeId("");
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">
        Your sessions
      </h1>
      <p className="text-on-surface-variant mt-1">
        Every visit you have logged. Open one to read it back or correct it.
      </p>

      <Card className="mt-6 flex flex-col gap-3">
        <Input
          type="search"
          label="Search"
          placeholder="Gym or route name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            type="date"
            label="From"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            label="To"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
          <div className="flex flex-col gap-stack-sm w-full min-w-0 font-sans">
            <label
              className="text-label-md text-on-surface-variant"
              htmlFor="sessions-grade"
            >
              Grade
            </label>
            <select
              id="sessions-grade"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg text-body-md bg-surface border border-outline text-on-surface focus:border-primary focus:outline-none dark:scheme-dark"
            >
              <option value="">Any grade</option>
              {grades.map((grade) => (
                <option key={grade.grade_id} value={grade.grade_id}>
                  {grade.grade_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-label-md text-on-surface-variant">
              {total === 0
                ? "No sessions match"
                : `${total} matching session${total === 1 ? "" : "s"}`}
            </p>
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      {isPending ? (
        <p className="mt-6 text-on-surface-variant animate-pulse">
          Loading sessions...
        </p>
      ) : isError ? (
        <Card className="mt-6 flex flex-col gap-3">
          <p className="text-error">Could not load your sessions.</p>
          <div>
            <Button variant="secondary" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="mt-6">
          <p className="text-on-surface-variant">
            {hasFilters
              ? "Nothing matches those filters. Try widening the dates or clearing the search."
              : "No sessions logged yet. Your first visit will show up here."}
          </p>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-3 mt-6 list-none p-0">
            {sessions.map((session) => (
              <li key={session.session_id}>
                <Card className="p-0">
                  <button
                    type="button"
                    onClick={() => setOpenSession(session)}
                    className="w-full p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-4 text-left cursor-pointer rounded-xl hover:bg-surface-container-high/40"
                  >
                    <span className="flex flex-row gap-4 min-w-0 items-baseline">
                      <span className="tabular-nums text-on-surface-variant shrink-0">
                        {formatDate(session.visit_date)}
                      </span>
                      <span className="font-bold truncate">
                        {session.gym_name ?? "Climbing session"}
                      </span>
                    </span>
                    <span className="text-on-surface-variant text-body-sm shrink-0">
                      {session.climb_count === 0
                        ? "No climbs logged"
                        : `${session.climb_count} route${session.climb_count === 1 ? "" : "s"} · ${session.total_sends}/${session.total_attempts} sent`}
                      {session.duration_minutes !== null &&
                        ` · ${formatMinutes(session.duration_minutes)}`}
                    </span>
                  </button>
                </Card>
              </li>
            ))}
          </ul>

          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage
                  ? "Loading..."
                  : `Load more (${sessions.length} of ${total})`}
              </Button>
            </div>
          )}
        </>
      )}

      <SessionDetail
        session={openSession}
        onClose={() => setOpenSession(null)}
      />
    </div>
  );
}
