import { useState } from "react";
import type WeaknessType from "../types/WeaknessType";
import Button from "./Button";

interface WeaknessPickerProps {
  options: WeaknessType[];
  /** Ids of presets or previously-saved custom labels. */
  selectedIds: number[];
  /** Labels typed into "Other" that do not exist as rows yet. */
  customLabels: string[];
  onChangeIds: (next: number[]) => void;
  onChangeLabels: (next: string[]) => void;
  isLoading?: boolean;
}

/**
 * "What held you back?" — a dropdown you can also type into.
 *
 * The dropdown carries the shared presets plus anything this climber has typed
 * before, so the second time someone blames their heel hooks it is one tap.
 * A brand-new phrase goes in the free-text box and is promoted to a saved
 * option when the session is saved — which is what keeps this data
 * aggregatable instead of turning into a pile of near-duplicate strings.
 *
 * Selections render as removable chips so several can be picked; a climb
 * usually fails for more than one reason.
 */
export default function WeaknessPicker({
  options,
  selectedIds,
  customLabels,
  onChangeIds,
  onChangeLabels,
  isLoading = false,
}: WeaknessPickerProps) {
  const [draft, setDraft] = useState("");

  const selectable = options.filter(
    (o) => !selectedIds.includes(o.weakness_type_id),
  );

  const addCustom = () => {
    const label = draft.trim();
    if (label === "") return;

    // Typing something that already exists should select it, not create a
    // duplicate — the server does this too, but doing it here means the chip
    // appears immediately and the counts stay right.
    const existing = options.find(
      (o) => o.label.toLowerCase() === label.toLowerCase(),
    );
    if (existing) {
      if (!selectedIds.includes(existing.weakness_type_id)) {
        onChangeIds([...selectedIds, existing.weakness_type_id]);
      }
    } else if (
      !customLabels.some((l) => l.toLowerCase() === label.toLowerCase())
    ) {
      onChangeLabels([...customLabels, label]);
    }
    setDraft("");
  };

  return (
    <div className="mt-3">
      <p className="text-label-md text-on-surface-variant mb-2">
        What held you back?
      </p>

      {(selectedIds.length > 0 || customLabels.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedIds.map((id) => {
            const option = options.find((o) => o.weakness_type_id === id);
            if (!option) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-label-md"
              >
                {option.label}
                <button
                  type="button"
                  aria-label={`Remove ${option.label}`}
                  onClick={() =>
                    onChangeIds(selectedIds.filter((s) => s !== id))
                  }
                  className="cursor-pointer opacity-70 hover:opacity-100"
                >
                  ✕
                </button>
              </span>
            );
          })}
          {customLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary-container text-on-tertiary-container text-label-md"
            >
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() =>
                  onChangeLabels(customLabels.filter((l) => l !== label))
                }
                className="cursor-pointer opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <select
        // Always reset to the placeholder: the control adds a chip rather than
        // holding a value, so leaving the last pick selected would imply the
        // dropdown itself is part of the answer.
        value=""
        disabled={isLoading || selectable.length === 0}
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) onChangeIds([...selectedIds, id]);
        }}
        className="w-full px-4 py-2 rounded-lg text-body-md bg-surface border border-outline text-on-surface focus:border-primary focus:outline-none dark:scheme-dark disabled:opacity-50"
      >
        <option value="">
          {isLoading
            ? "Loading..."
            : selectable.length === 0
              ? "All options selected"
              : "Select a reason..."}
        </option>
        {selectable.map((option) => (
          <option key={option.weakness_type_id} value={option.weakness_type_id}>
            {option.label}
            {option.user_id !== null ? " (yours)" : ""}
          </option>
        ))}
      </select>

      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={draft}
          maxLength={60}
          placeholder="Other — type your own"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Inside a form this would submit the session instead of adding
              // a word.
              e.preventDefault();
              addCustom();
            }
          }}
          className="flex-1 min-w-0 px-4 py-2 rounded-lg text-body-md bg-surface border border-outline text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none"
        />
        <Button variant="secondary" onClick={addCustom} disabled={draft.trim() === ""}>
          Add
        </Button>
      </div>
      <p className="text-label-sm text-on-surface-variant mt-1.5">
        Anything you type is saved as your own option for next time.
      </p>
    </div>
  );
}
