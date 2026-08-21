import { useTranslation } from "react-i18next";
import Button from "./Button";
import Counter from "./Counter";
import Input from "./Input";
import TagSelector from "./TagSelector";
import WeaknessPicker from "./WeaknessPicker";
import { useClimbTaxonomies } from "../hooks/useClimbTaxonomies";
import type AttemptType from "../types/AttemptType";

/**
 * The route form: name, grade, tries and sends, wall and hold tags, and what
 * the climber blamed.
 *
 * Three screens ask for exactly this — logging a new visit, correcting a climb
 * inside the log form before it is saved, and editing one on a session that was
 * saved weeks ago — and they have to agree field for field. When this lived
 * inside LogSession the third of those could not exist without copying it.
 *
 * State stays with the caller. This renders whatever climb it is handed and
 * reports edits back through `update`, so the same fields serve a draft held in
 * component state and one being PATCHed to the API.
 */
export interface ClimbFieldsProps {
  climb: AttemptType;
  update: <K extends keyof AttemptType>(
    field: K,
    value: AttemptType[K],
  ) => void;
}

export default function ClimbFields({ climb, update }: ClimbFieldsProps) {
  const { t } = useTranslation("sessions");
  const {
    grades,
    wallTypes,
    holdTypes,
    weaknesses,
    isGradesLoading,
    isGradesError,
    refetchGrades,
    isWallTypesLoading,
    isHoldTypesLoading,
    isWeaknessesLoading,
  } = useClimbTaxonomies();

  return (
    <>
      <Input
        type="text"
        label={t("climbForm.routeName")}
        required
        placeholder={t("climbForm.routeNamePlaceholder")}
        value={climb.route_name}
        onChange={(e) => update("route_name", e.target.value)}
      />

      <div className="mt-3">
        <p className="text-label-md text-on-surface-variant mb-2">
          {t("climbForm.grade")}
        </p>
        <div className="flex flex-row gap-2 overflow-x-auto py-2">
          {isGradesLoading && (
            <p className="text-on-surface-variant py-2">
              {t("climbForm.gradesLoading")}
            </p>
          )}
          {isGradesError && (
            <>
              <p className="text-error self-center">
                {t("climbForm.gradesError")}
              </p>
              <Button variant="secondary" onClick={() => refetchGrades()}>
                {t("common:action.retry")}
              </Button>
            </>
          )}
          {grades.map((grade) => (
            <Button
              key={grade.grade_id}
              onClick={() => update("grade_name", grade.grade_name)}
              className={
                climb.grade_name === grade.grade_name
                  ? ""
                  : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              }
            >
              {grade.grade_name}
            </Button>
          ))}
        </div>
      </div>

      {/*
        The counts replace the old Sent/Attempted toggle. One row per route
        instead of one row per try: working a project eight times is an 8 here,
        not eight trips through this form.
      */}
      <div className="flex gap-3 mt-3">
        <Counter
          label={t("climbForm.tries")}
          value={climb.attempt_count}
          min={1}
          onChange={(next) => update("attempt_count", next)}
        />
        <Counter
          label={t("climbForm.sends")}
          value={climb.send_count}
          max={climb.attempt_count}
          emphasis
          onChange={(next) => update("send_count", next)}
          hint={
            climb.attempt_count === 1 && climb.send_count === 1
              ? t("climbForm.flashHint")
              : undefined
          }
        />
      </div>

      <TagSelector
        label={t("climbForm.wallType")}
        options={wallTypes.map((w) => ({ id: w.id, label: w.label }))}
        value={climb.wall_type_ids}
        onChange={(next) => update("wall_type_ids", next)}
        isLoading={isWallTypesLoading}
      />

      <TagSelector
        label={t("climbForm.holdTypes")}
        options={holdTypes.map((h) => ({ id: h.id, label: h.label }))}
        value={climb.hold_type_ids}
        onChange={(next) => update("hold_type_ids", next)}
        isLoading={isHoldTypesLoading}
      />

      <WeaknessPicker
        options={weaknesses}
        selectedIds={climb.weakness_type_ids}
        customLabels={climb.weakness_labels}
        onChangeIds={(next) => update("weakness_type_ids", next)}
        onChangeLabels={(next) => update("weakness_labels", next)}
        isLoading={isWeaknessesLoading}
      />
    </>
  );
}
