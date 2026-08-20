import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Trans, useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  CSV_COLUMNS,
  csvTemplate,
  parseClimbingCsv,
  type ParseResult,
  type ParsedSession,
} from "../lib/csvImport";
import { useClimbTaxonomies } from "../hooks/useClimbTaxonomies";
import { formatDate } from "../lib/date";
import Card from "../components/Card";
import Button from "../components/Button";

/**
 * Bring an existing climbing history in from a spreadsheet.
 *
 * Someone arriving with two years of logging elsewhere gets an app that thinks
 * they have never climbed: no trends, no personal records, and an AI coach with
 * nothing to read. Kaya has no public API to pull that from, so this takes the
 * CSV every logging app and every spreadsheet can produce.
 *
 * Sessions are posted one at a time through the ordinary create endpoint rather
 * than a bulk one. Each is already transactional, already validates, and
 * already resolves tags — and a year of climbing is around 150 requests, well
 * inside the rate limit. A bulk endpoint would be a second implementation of
 * the same rules for no gain at this size.
 */

type Phase = "choose" | "preview" | "importing" | "done";

interface ImportOutcome {
  imported: number;
  failedAt: { session: ParsedSession; message: string } | null;
}

export default function ImportCsv() {
  const { t } = useTranslation("sessions");
  const queryClient = useQueryClient();
  const { grades, gradeIdByName, isGradesLoading } = useClimbTaxonomies();
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("choose");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const reset = () => {
    setPhase("choose");
    setFileName("");
    setResult(null);
    setProgress(0);
    setOutcome(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setResult(
      parseClimbingCsv(
        text,
        grades.map((g) => g.grade_name),
      ),
    );
    setPhase("preview");
  };

  const downloadTemplate = () => {
    const blob = new Blob([csvTemplate()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "climblog-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!result) return;
    setPhase("importing");
    setProgress(0);

    let imported = 0;
    for (const session of result.sessions) {
      try {
        // Parsing already checked every grade against this same list, so a miss
        // here means the list changed underneath — vanishingly unlikely, and
        // worth saying plainly rather than letting an absent grade_id come back
        // as a 400 about a field the climber never filled in.
        const attempts = session.climbs.map((climb) => {
          const gradeId = gradeIdByName(climb.grade_name);
          if (gradeId === undefined) {
            throw new Error(`Unknown grade ${climb.grade_name}`);
          }
          return {
            grade_id: gradeId,
            route_name: climb.route_name || null,
            attempt_count: climb.attempt_count,
            send_count: climb.send_count,
            note: climb.note || null,
          };
        });

        await api("/sessions", {
          method: "POST",
          body: JSON.stringify({
            visit_date: session.visit_date,
            gym_name: session.gym_name || null,
            duration_minutes: session.duration_minutes,
            attempts,
          }),
        });
        imported += 1;
        setProgress(imported);
      } catch (err) {
        // Stop rather than carry on. The sessions before this one are saved and
        // named, so the climber can trim the file and re-run from here — which
        // is only true because they were imported oldest first.
        setOutcome({
          imported,
          failedAt: {
            session,
            message: err instanceof Error ? err.message : "Request failed",
          },
        });
        setPhase("done");
        invalidate();
        return;
      }
    }

    setOutcome({ imported, failedAt: null });
    setPhase("done");
    invalidate();
    toast.success(`Imported ${imported} session${imported === 1 ? "" : "s"}`);
  };

  const invalidate = () => {
    for (const key of [["sessions"], ["stats"], ["attempts"]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">
        Import your climbing history
      </h1>
      <p className="text-on-surface-variant mt-1">
        Bring in what you have logged elsewhere, one row per route, so your
        trends and your coach start from the whole picture.
      </p>

      {phase === "choose" && (
        <>
          <Card className="mt-6">
            <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              The format
            </h2>
            <p className="text-on-surface-variant text-body-sm">
              A CSV with these columns. One row is one route; repeat the date and
              gym on every row of the same visit, and they are grouped into one
              session for you.
            </p>
            <p className="font-mono text-label-sm bg-surface-container-high/40 border border-outline-variant/30 rounded-lg p-3 mt-3 overflow-x-auto">
              {CSV_COLUMNS.join(",")}
            </p>
            <p className="text-on-surface-variant text-body-sm mt-3">
              Only <span className="font-bold">visit_date</span> and{" "}
              <span className="font-bold">grade</span> are required. Dates are
              YYYY-MM-DD; grades are V0 to V17.
            </p>
            <div className="mt-4">
              <Button variant="secondary" onClick={downloadTemplate}>
                Download a template
              </Button>
            </div>
          </Card>

          <Card className="mt-4">
            <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              Your file
            </h2>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              disabled={isGradesLoading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="block w-full text-body-md text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-label-md file:bg-primary file:text-on-primary hover:file:bg-primary-container file:cursor-pointer"
            />
            <p className="text-on-surface-variant text-body-sm mt-2">
              Nothing is saved until you have seen what it found.
            </p>
          </Card>
        </>
      )}

      {phase === "preview" && result && (
        <>
          <Card className="mt-6">
            <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              What {fileName} contains
            </h2>
            <p className="text-on-surface">
              <span className="font-bold tabular-nums">
                {result.sessions.length}
              </span>{" "}
              session{result.sessions.length === 1 ? "" : "s"} ·{" "}
              <span className="font-bold tabular-nums">{result.climbCount}</span>{" "}
              route{result.climbCount === 1 ? "" : "s"}
              {result.problems.length > 0 && (
                <>
                  {" · "}
                  <span className="text-error font-bold tabular-nums">
                    {result.problems.length}
                  </span>{" "}
                  row{result.problems.length === 1 ? "" : "s"} skipped
                </>
              )}
            </p>
          </Card>

          {result.problems.length > 0 && (
            <Card className="mt-4 border-error/40">
              <h2 className="text-label-md font-bold text-error uppercase tracking-wide mb-2">
                Rows that will be skipped
              </h2>
              <ul className="flex flex-col gap-1.5 list-none p-0 max-h-64 overflow-y-auto">
                {result.problems.map((problem) => (
                  <li
                    key={`${problem.line}-${problem.message}`}
                    className="text-body-sm"
                  >
                    <span className="text-on-surface-variant tabular-nums">
                      Row {problem.line}:
                    </span>{" "}
                    {problem.message}
                  </li>
                ))}
              </ul>
              <p className="text-on-surface-variant text-body-sm mt-3">
                Everything else still imports. Fix these in your file and run it
                again if you want them too — nothing is imported twice unless the
                rows are.
              </p>
            </Card>
          )}

          {result.sessions.length > 0 && (
            <Card className="mt-4">
              <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
                Sessions to create
              </h2>
              <ul className="flex flex-col gap-2 list-none p-0 max-h-80 overflow-y-auto">
                {result.sessions.map((session) => (
                  <li
                    key={`${session.visit_date}-${session.gym_name}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-lg bg-surface-container-high/40 border border-outline-variant/30 px-3 py-2"
                  >
                    <span className="flex items-baseline gap-3 min-w-0">
                      <span className="tabular-nums text-on-surface-variant text-body-sm shrink-0">
                        {formatDate(session.visit_date)}
                      </span>
                      <span className="font-bold truncate">
                        {session.gym_name || "Climbing session"}
                      </span>
                    </span>
                    <span className="text-on-surface-variant text-body-sm shrink-0">
                      {session.climbs.length} route
                      {session.climbs.length === 1 ? "" : "s"} ·{" "}
                      {session.climbs.reduce((sum, c) => sum + c.send_count, 0)}{" "}
                      sent
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap gap-3 mt-4">
            <Button
              onClick={() => void runImport()}
              disabled={result.sessions.length === 0}
            >
              Import {result.sessions.length} session
              {result.sessions.length === 1 ? "" : "s"}
            </Button>
            <Button variant="secondary" onClick={reset}>
              Choose a different file
            </Button>
          </div>
        </>
      )}

      {phase === "importing" && result && (
        <Card className="mt-6">
          <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
            Importing
          </h2>
          <div
            className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={result.sessions.length}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${(progress / result.sessions.length) * 100}%`,
              }}
            />
          </div>
          <p className="text-on-surface-variant text-body-sm mt-2 tabular-nums">
            {progress} of {result.sessions.length} sessions saved. Leave this tab
            open until it finishes.
          </p>
        </Card>
      )}

      {phase === "done" && outcome && (
        <Card className={`mt-6 ${outcome.failedAt ? "border-error/40" : ""}`}>
          <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
            {outcome.failedAt ? "Stopped partway" : "Done"}
          </h2>
          <p className="text-on-surface">
            <span className="font-bold tabular-nums">{outcome.imported}</span>{" "}
            session{outcome.imported === 1 ? "" : "s"} imported.
          </p>
          {outcome.failedAt && (
            <p className="text-on-surface-variant text-body-sm mt-2">
              The session dated {formatDate(outcome.failedAt.session.visit_date)}{" "}
              was rejected: {outcome.failedAt.message}. Sessions are imported
              oldest first, so everything before that date is saved — remove
              those rows from your file and import the rest.
            </p>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={reset}>
              Import another file
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
