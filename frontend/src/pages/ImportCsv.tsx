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
            throw new Error(
              t("import.error.unknownGrade", { grade: climb.grade_name }),
            );
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
            message:
              err instanceof Error
                ? err.message
                : t("import.error.requestFailed"),
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
    toast.success(t("import.toast.imported", { count: imported }));
  };

  const invalidate = () => {
    for (const key of [["sessions"], ["stats"], ["attempts"]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">
        {t("import.title")}
      </h1>
      <p className="text-on-surface-variant mt-1">{t("import.subtitle")}</p>

      {phase === "choose" && (
        <>
          <Card className="mt-6">
            <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              {t("import.format.heading")}
            </h2>
            <p className="text-on-surface-variant text-body-sm">
              {t("import.format.body")}
            </p>
            <p className="font-mono text-label-sm bg-surface-container-high/40 border border-outline-variant/30 rounded-lg p-3 mt-3 overflow-x-auto">
              {CSV_COLUMNS.join(",")}
            </p>
            <p className="text-on-surface-variant text-body-sm mt-3">
              <Trans
                t={t}
                i18nKey="import.format.required"
                components={{ b: <span className="font-bold" /> }}
              />
            </p>
            <div className="mt-4">
              <Button variant="secondary" onClick={downloadTemplate}>
                {t("import.format.download")}
              </Button>
            </div>
          </Card>

          <Card className="mt-4">
            <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              {t("import.file.heading")}
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
              {t("import.file.hint")}
            </p>
          </Card>
        </>
      )}

      {phase === "preview" && result && (
        <>
          <Card className="mt-6">
            <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              {t("import.preview.heading", { fileName })}
            </h2>
            <p className="text-on-surface">
              <span className="font-bold tabular-nums">
                {t("import.sessionCount", { count: result.sessions.length })}
              </span>
              {" · "}
              <span className="font-bold tabular-nums">
                {t("common:climb.routes", { count: result.climbCount })}
              </span>
              {result.problems.length > 0 && (
                <>
                  {" · "}
                  <span className="text-error font-bold tabular-nums">
                    {t("import.rowCount", { count: result.problems.length })}
                  </span>
                  {t("import.skippedSuffix")}
                </>
              )}
            </p>
          </Card>

          {result.problems.length > 0 && (
            <Card className="mt-4 border-error/40">
              <h2 className="text-label-md font-bold text-error uppercase tracking-wide mb-2">
                {t("import.preview.problemsHeading")}
              </h2>
              <ul className="flex flex-col gap-1.5 list-none p-0 max-h-64 overflow-y-auto">
                {result.problems.map((problem) => (
                  <li
                    key={`${problem.line}-${problem.code}`}
                    className="text-body-sm"
                  >
                    <span className="text-on-surface-variant tabular-nums">
                      {t("import.preview.problemRow", { line: problem.line })}
                    </span>{" "}
                    {t(`import.problem.${problem.code}`, problem.values)}
                  </li>
                ))}
              </ul>
              <p className="text-on-surface-variant text-body-sm mt-3">
                {t("import.preview.problemsNote")}
              </p>
            </Card>
          )}

          {result.sessions.length > 0 && (
            <Card className="mt-4">
              <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
                {t("import.preview.sessionsHeading")}
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
                        {session.gym_name || t("common:climb.climbingSession")}
                      </span>
                    </span>
                    <span className="text-on-surface-variant text-body-sm shrink-0">
                      {`${t("common:climb.routes", {
                        count: session.climbs.length,
                      })} · ${t("import.sentCount", {
                        sends: session.climbs.reduce(
                          (sum, c) => sum + c.send_count,
                          0,
                        ),
                      })}`}
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
              {t("import.preview.importButton", {
                count: result.sessions.length,
              })}
            </Button>
            <Button variant="secondary" onClick={reset}>
              {t("import.preview.chooseAnother")}
            </Button>
          </div>
        </>
      )}

      {phase === "importing" && result && (
        <Card className="mt-6">
          <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
            {t("import.importing.heading")}
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
            {t("import.importing.progress", {
              done: progress,
              total: result.sessions.length,
            })}
          </p>
        </Card>
      )}

      {phase === "done" && outcome && (
        <Card className={`mt-6 ${outcome.failedAt ? "border-error/40" : ""}`}>
          <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
            {outcome.failedAt
              ? t("import.done.headingFailed")
              : t("import.done.heading")}
          </h2>
          <p className="text-on-surface">
            <span className="font-bold tabular-nums">
              {t("import.sessionCount", { count: outcome.imported })}
            </span>
            {t("import.done.importedSuffix")}
          </p>
          {outcome.failedAt && (
            <p className="text-on-surface-variant text-body-sm mt-2">
              {t("import.done.failure", {
                date: formatDate(outcome.failedAt.session.visit_date),
                message: outcome.failedAt.message,
              })}
            </p>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={reset}>
              {t("import.done.again")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
