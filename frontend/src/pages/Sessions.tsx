import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("sessions");
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
        {t("list.title")}
      </h1>
      <p className="text-on-surface-variant mt-1">{t("list.subtitle")}</p>

      <Card className="mt-6 flex flex-col gap-3">
        <Input
          type="search"
          label={t("list.searchLabel")}
          placeholder={t("list.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/*
          Two columns before three. A date input has an intrinsic width of about
          167px — the value plus the calendar indicator — and three tracks in
          this card do not reach that until `lg`: at the old `md` breakpoint
          each field got 135px and Chrome clipped the year under the icon, which
          is the filter row reading as broken. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input
            type="date"
            label={t("list.from")}
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            label={t("list.to")}
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
          <div className="flex flex-col gap-stack-sm w-full min-w-0 font-sans">
            <label
              className="text-label-md text-on-surface-variant"
              htmlFor="sessions-grade"
            >
              {t("list.grade")}
            </label>
            <select
              id="sessions-grade"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg text-body-md bg-surface border border-outline text-on-surface focus:border-primary focus:outline-none dark:scheme-dark"
            >
              <option value="">{t("list.anyGrade")}</option>
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
                ? t("list.noMatches")
                : t("list.matchCount", { count: total })}
            </p>
            <Button variant="secondary" onClick={clearFilters}>
              {t("list.clearFilters")}
            </Button>
          </div>
        )}
      </Card>

      {isPending ? (
        <p className="mt-6 text-on-surface-variant animate-pulse">
          {t("list.loading")}
        </p>
      ) : isError ? (
        <Card className="mt-6 flex flex-col gap-3">
          <p className="text-error">{t("list.loadError")}</p>
          <div>
            <Button variant="secondary" onClick={() => refetch()}>
              {t("common:action.retry")}
            </Button>
          </div>
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="mt-6">
          <p className="text-on-surface-variant">
            {hasFilters ? t("list.emptyFiltered") : t("list.empty")}
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
                        {session.gym_name ?? t("common:climb.climbingSession")}
                      </span>
                    </span>
                    <span className="text-on-surface-variant text-body-sm shrink-0">
                      {session.climb_count === 0
                        ? t("list.noClimbs")
                        : `${t("common:climb.routes", {
                            count: session.climb_count,
                          })} · ${t("common:climb.sentOf", {
                            sends: session.total_sends,
                            tries: session.total_attempts,
                          })}`}
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
                  ? t("common:state.loading")
                  : t("list.loadMore", { loaded: sessions.length, total })}
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
