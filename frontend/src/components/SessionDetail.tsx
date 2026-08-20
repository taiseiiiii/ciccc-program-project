import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate, formatMinutes, pluralize } from "../lib/date";
import type SessionType from "../types/SessionType";
import type { AttemptRecord } from "../types/AttemptType";
import { isFlash } from "../types/AttemptType";
import type Media from "../types/MediaType";
import Modal from "./Modal";
import MediaGallery from "./MediaGallery";

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
 * One gym visit, in full: what was climbed, how it went, and the photos.
 *
 * This is the screen the app was missing. Sessions could be logged and counted
 * but never read back, which meant attachments in particular had nowhere to be
 * shown — the log form uploads them against an attempt id and nothing ever
 * asked for them again.
 */
export default function SessionDetail({ session, onClose }: SessionDetailProps) {
  const queryClient = useQueryClient();
  const sessionId = session?.session_id;

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

  return (
    <Modal
      open={session !== null}
      onClose={onClose}
      size="lg"
      title={session ? (session.gym_name ?? "Climbing session") : "Session"}
    >
      {session && (
        <>
          <p className="text-on-surface-variant">
            {formatDate(session.visit_date)}
            {session.duration_minutes !== null &&
              ` · ${formatMinutes(session.duration_minutes)} on the wall`}
          </p>

          {isAttemptsLoading ? (
            <p className="mt-4 text-on-surface-variant animate-pulse">
              Loading climbs...
            </p>
          ) : attempts.length === 0 ? (
            <p className="mt-4 text-on-surface-variant">
              No climbs were logged on this visit.
            </p>
          ) : (
            <>
              <p className="mt-1 text-label-md text-on-surface-variant">
                {pluralize(attempts.length, "route")} · {sends} sent from {tries}{" "}
                tries
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
            </>
          )}

          {/* Anything pinned to the visit rather than to one climb. */}
          <MediaGallery
            media={media.filter((m) => m.attempt_id === null)}
            onChanged={refetchMedia}
          />
        </>
      )}
    </Modal>
  );
}
