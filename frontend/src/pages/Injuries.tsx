import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

import type Injury from "../types/InjuryType";
import type { InjuryCreate, InjuryLog, InjuryUpdate } from "../types/InjuryType";
import type TaxonomyTerm from "../types/TaxonomyType";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Textarea from "../components/Textarea";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { daysSince, formatDate, formatDayMonth, pluralize, todayString } from "../lib/date";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const STATUS_STYLES: Record<Injury["status"], string> = {
  active: "text-on-error-container bg-error-container",
  recovering: "text-tertiary bg-tertiary/10",
  healed: "text-primary bg-primary/10",
};

const STATUS_LABELS: Record<Injury["status"], string> = {
  active: "Still hurts",
  recovering: "Getting back on it",
  healed: "Healed",
};

const SIDES = ["left", "right", "both"] as const;

/**
 * The pain trend for one injury.
 *
 * This chart is most of the reason the feature exists. Day to day an injury
 * feels the same, and it is genuinely hard to tell recovery from
 * stagnation — the line answers that, and it is the honest thing this app can
 * offer in place of advice it is not qualified to give.
 */
const PainChart = ({ injuryId }: { injuryId: number }) => {
  const { data, isPending } = useQuery({
    queryKey: ["injury-logs", injuryId],
    queryFn: () => api<{ data: InjuryLog[] }>(`/injuries/${injuryId}/logs`),
  });

  const logs = data?.data ?? [];
  if (isPending) {
    return (
      <p className="text-on-surface-variant text-body-sm mt-3">
        Loading check-ins...
      </p>
    );
  }
  if (logs.length < 2) {
    return (
      <p className="text-on-surface-variant text-body-sm mt-3">
        Check in for a couple of days and the trend will show up here.
      </p>
    );
  }

  const chartData = logs.map((log) => ({
    date: formatDayMonth(log.logged_on),
    pain: log.pain_level,
  }));

  return (
    <div className="h-40 w-full mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <XAxis dataKey="date" stroke="var(--color-outline)" fontSize={11} />
          <YAxis
            domain={[0, 10]}
            stroke="var(--color-outline)"
            fontSize={11}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value) => [`${value}/10`, "Pain"]}
            contentStyle={{
              backgroundColor: "var(--color-surface-container-highest)",
              borderColor: "var(--color-outline-variant)",
              borderRadius: "8px",
              color: "var(--color-on-surface)",
            }}
          />
          <Line
            type="monotone"
            dataKey="pain"
            stroke="var(--color-error)"
            strokeWidth={3}
            dot={{ fill: "var(--color-error)", r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const Injuries = () => {
  const today = todayString();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showHealed, setShowHealed] = useState(false);
  // Deleting an injury takes every pain check-in with it, so it asks first —
  // it used to be a single tap with no confirmation at all.
  const [pendingDelete, setPendingDelete] = useState<Injury | null>(null);

  const [form, setForm] = useState<{
    bodyPartId: number | null;
    side: "left" | "right" | "both" | null;
    occurredOn: string;
    severity: number;
    description: string;
  }>({
    bodyPartId: null,
    side: null,
    occurredOn: today,
    severity: 3,
    description: "",
  });

  // Per-injury check-in drafts, keyed by injury id so two open cards do not
  // share one slider.
  const [checkIns, setCheckIns] = useState<
    Record<number, { pain: number; note: string }>
  >({});

  const { data: injuriesData, isPending } = useQuery({
    queryKey: ["injuries"],
    queryFn: () => api<{ data: Injury[] }>("/injuries"),
  });

  const { data: bodyPartsData, isPending: isBodyPartsLoading } = useQuery({
    queryKey: ["body-parts"],
    queryFn: () => api<{ data: TaxonomyTerm[] }>("/body-parts"),
    staleTime: Infinity,
  });

  const injuries = injuriesData?.data ?? [];
  const bodyParts = bodyPartsData?.data ?? [];
  const openInjuries = injuries.filter((i) => i.status !== "healed");
  const healedInjuries = injuries.filter((i) => i.status === "healed");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["injuries"] });
    // Training plans are generated around active injuries, so a status change
    // makes the shown plan stale in a way the climber cares about.
    queryClient.invalidateQueries({ queryKey: ["trainings"] });
  };

  const { mutate: createInjury, isPending: isCreating } = useMutation({
    mutationFn: (input: InjuryCreate) =>
      api("/injuries", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      invalidate();
      setIsFormOpen(false);
      setForm({
        bodyPartId: null,
        side: null,
        occurredOn: today,
        severity: 3,
        description: "",
      });
      toast.success("Injury recorded. Take it easy.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    },
  });

  const { mutate: updateInjury } = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: InjuryUpdate }) =>
      api(`/injuries/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      invalidate();
      toast.success("Updated");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    },
  });

  const { mutate: deleteInjury } = useMutation({
    mutationFn: (id: number) => api(`/injuries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setPendingDelete(null);
      toast.success("Injury removed");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    },
  });

  const { mutate: logPain, isPending: isLogging, variables: loggingFor } =
    useMutation({
    mutationFn: ({
      id,
      pain,
      note,
    }: {
      id: number;
      pain: number;
      note: string;
    }) =>
      api(`/injuries/${id}/logs`, {
        method: "POST",
        body: JSON.stringify({
          pain_level: pain,
          // The client's own date: the server's today can be a different day
          // in the climber's timezone.
          logged_on: today,
          note: note.trim() || null,
        }),
      }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["injuries"] });
      queryClient.invalidateQueries({
        queryKey: ["injury-logs", variables.id],
      });
      setCheckIns((current) => ({
        ...current,
        [variables.id]: { pain: variables.pain, note: "" },
      }));
      toast.success("Checked in for today");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to check in");
    },
  });

  const handleCreate = () => {
    if (!form.bodyPartId) {
      toast.error("Which body part?");
      return;
    }
    createInjury({
      body_part_id: form.bodyPartId,
      side: form.side,
      occurred_on: form.occurredOn,
      severity: form.severity,
      description: form.description.trim() || null,
    });
  };

  const renderInjuryCard = (injury: Injury) => {
    const isExpanded = expandedId === injury.injury_id;
    const checkIn = checkIns[injury.injury_id] ?? {
      pain: injury.latest_pain_level ?? 3,
      note: "",
    };
    const isSavingThis = isLogging && loggingFor?.id === injury.injury_id;

    return (
      <Card key={injury.injury_id} className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-body-lg">
                {injury.body_part_label}
                {injury.side ? ` (${injury.side})` : ""}
              </p>
              <span
                className={`${STATUS_STYLES[injury.status]} font-bold px-2.5 py-1 rounded-full text-xs`}
              >
                {STATUS_LABELS[injury.status]}
              </span>
            </div>
            <p className="text-on-surface-variant text-body-sm mt-1">
              Since {formatDate(injury.occurred_on)}
              {injury.status !== "healed" &&
                ` · ${pluralize(daysSince(injury.occurred_on), "day")}`}
              {injury.severity ? ` · severity ${injury.severity}/5` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {injury.latest_pain_level !== null && (
              <span className="text-on-surface-variant text-body-sm">
                Last: {injury.latest_pain_level}/10
              </span>
            )}
            <Button
              variant="secondary"
              onClick={() =>
                setExpandedId(isExpanded ? null : injury.injury_id)
              }
            >
              {isExpanded ? "Close" : "Open"}
            </Button>
          </div>
        </div>

        {injury.description && (
          <p className="text-on-surface-variant mt-2">{injury.description}</p>
        )}

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-outline-variant">
            <PainChart injuryId={injury.injury_id} />

            {injury.status !== "healed" && (
              <div className="mt-4">
                <label
                  htmlFor={`pain-${injury.injury_id}`}
                  className="text-label-md text-on-surface-variant"
                >
                  How does it feel today? — {checkIn.pain}/10
                </label>
                <input
                  id={`pain-${injury.injury_id}`}
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={checkIn.pain}
                  onChange={(e) =>
                    setCheckIns((current) => ({
                      ...current,
                      [injury.injury_id]: {
                        ...checkIn,
                        pain: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full mt-2 accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-label-sm text-on-surface-variant">
                  <span>No pain</span>
                  <span>Worst it has been</span>
                </div>

                <div className="mt-3">
                  <Textarea
                    placeholder="Anything worth remembering about today?"
                    className="min-h-16"
                    value={checkIn.note}
                    onChange={(e) =>
                      setCheckIns((current) => ({
                        ...current,
                        [injury.injury_id]: {
                          ...checkIn,
                          note: e.target.value,
                        },
                      }))
                    }
                  />
                </div>

                <div className="flex justify-end mt-3">
                  {/* Scoped to this card: a single shared flag disabled every
                      open injury's button while any one of them saved. */}
                  <Button
                    disabled={isSavingThis}
                    onClick={() =>
                      logPain({
                        id: injury.injury_id,
                        pain: checkIn.pain,
                        note: checkIn.note,
                      })
                    }
                  >
                    {isSavingThis ? "Saving..." : "Check in for today"}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-between mt-4 pt-4 border-t border-outline-variant">
              <div className="flex flex-wrap gap-2">
                {(["active", "recovering", "healed"] as const)
                  .filter((status) => status !== injury.status)
                  .map((status) => (
                    <Button
                      key={status}
                      variant="secondary"
                      onClick={() =>
                        updateInjury({
                          id: injury.injury_id,
                          patch: { status },
                        })
                      }
                    >
                      Mark {STATUS_LABELS[status].toLowerCase()}
                    </Button>
                  ))}
              </div>
              <Button variant="error" onClick={() => setPendingDelete(injury)}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
            Injuries
          </h1>
          <p>
            Track what hurts, watch it improve, and keep your training plans
            away from it.
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>+ Record an injury</Button>
      </div>

      {/*
        Stated up front, not buried. This app records and manages load — it
        does not diagnose, and it will not tell anyone how to treat an injury.
      */}
      <Card className="mt-4 border-l-4 border-l-error">
        <p className="font-bold">This is a logbook, not a doctor</p>
        <p className="text-on-surface-variant mt-1">
          Nothing here is medical advice. The app records how you feel and keeps
          training suggestions off the affected area — it cannot tell you what
          is wrong or how to fix it. If pain persists, worsens, or came on
          suddenly, see a doctor or physiotherapist.
        </p>
      </Card>

      {isPending ? (
        <p className="text-on-surface-variant mt-6">Loading...</p>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3">
            {openInjuries.length === 0 ? (
              <Card>
                <p className="font-bold">Nothing hurting right now</p>
                <p className="text-on-surface-variant mt-1">
                  Good. If that changes, record it here — the AI coach will
                  route your training around it.
                </p>
              </Card>
            ) : (
              openInjuries.map(renderInjuryCard)
            )}
          </div>

          {healedInjuries.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowHealed((shown) => !shown)}
                className="text-primary text-label-md hover:underline cursor-pointer"
              >
                {showHealed ? "Hide" : "Show"} {healedInjuries.length} healed
                injur{healedInjuries.length === 1 ? "y" : "ies"}
              </button>
              {showHealed && (
                <div className="mt-3 flex flex-col gap-3">
                  {healedInjuries.map(renderInjuryCard)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() =>
          pendingDelete && deleteInjury(pendingDelete.injury_id)
        }
        title="Delete this injury?"
        message={
          pendingDelete
            ? `This removes the ${pendingDelete.body_part_label.toLowerCase()} record and every pain check-in on it. That history cannot be recovered.`
            : ""
        }
        confirmLabel="Delete"
      />

      <Modal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Record an injury"
        size="lg"
        footer={
          <>
            <span />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "Saving..." : "Save"}
              </Button>
            </div>
          </>
        }
      >
            <p className="text-label-md text-on-surface-variant mb-2">
              Where does it hurt?
            </p>
            {isBodyPartsLoading ? (
              <p className="text-on-surface-variant text-body-sm">Loading...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bodyParts.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    aria-pressed={form.bodyPartId === part.id}
                    onClick={() =>
                      setForm((f) => ({ ...f, bodyPartId: part.id }))
                    }
                    className={`px-3 py-1.5 rounded-full text-label-md border cursor-pointer transition-colors ${
                      form.bodyPartId === part.id
                        ? "bg-primary text-on-primary border-primary font-bold"
                        : "bg-surface-container-high text-on-surface border-outline-variant hover:bg-surface-container-highest"
                    }`}
                  >
                    {part.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              <p className="text-label-md text-on-surface-variant mb-2">
                Which side?
              </p>
              <div className="flex flex-wrap gap-2">
                {SIDES.map((side) => (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={form.side === side}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        side: f.side === side ? null : side,
                      }))
                    }
                    className={`px-3 py-1.5 rounded-full text-label-md border capitalize cursor-pointer transition-colors ${
                      form.side === side
                        ? "bg-primary text-on-primary border-primary font-bold"
                        : "bg-surface-container-high text-on-surface border-outline-variant hover:bg-surface-container-highest"
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <Input
                type="date"
                label="When did it start?"
                max={today}
                value={form.occurredOn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, occurredOn: e.target.value }))
                }
              />
            </div>

            <div className="mt-4">
              <label
                htmlFor="severity"
                className="text-label-md text-on-surface-variant"
              >
                How bad is it? — {form.severity}/5
              </label>
              <input
                id="severity"
                type="range"
                min={1}
                max={5}
                step={1}
                value={form.severity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, severity: Number(e.target.value) }))
                }
                className="w-full mt-2 accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-label-sm text-on-surface-variant">
                <span>Niggle</span>
                <span>Can't climb</span>
              </div>
            </div>

            <div className="mt-4">
              <Textarea
                label="What happened?"
                placeholder="Felt a pop on a small crimp on an overhang..."
                className="min-h-20"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

      </Modal>
    </div>
  );
};

export default Injuries;
