interface TagOption {
  id: number;
  label: string;
}

interface TagSelectorProps {
  label: string;
  options: TagOption[];
  /** Currently selected ids. */
  value: number[];
  onChange: (next: number[]) => void;
  /** Shown instead of the buttons while the master list is loading. */
  isLoading?: boolean;
  hint?: string;
}

/**
 * A multi-select group of pill buttons — the pattern the log form uses for
 * wall angles and hold types.
 *
 * Buttons rather than a multi-select dropdown because this gets filled in on a
 * phone, one-handed, between climbs: every option is visible and one tap wide,
 * where a dropdown would be two taps and a scroll.
 *
 * Each button carries `aria-pressed`, so a screen reader announces the toggle
 * state rather than just the label.
 */
export default function TagSelector({
  label,
  options,
  value,
  onChange,
  isLoading = false,
  hint,
}: TagSelectorProps) {
  const toggle = (id: number) => {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  };

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-label-md text-on-surface-variant mb-2">{label}</p>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-label-sm text-on-surface-variant hover:text-on-surface underline cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-on-surface-variant text-body-sm py-2">Loading...</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const isSelected = value.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(option.id)}
                className={`px-3 py-1.5 rounded-full text-label-md transition-colors cursor-pointer border ${
                  isSelected
                    ? "bg-primary text-on-primary border-primary font-bold"
                    : "bg-surface-container-high text-on-surface border-outline-variant hover:bg-surface-container-highest"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {hint && (
        <p className="text-label-sm text-on-surface-variant mt-1.5">{hint}</p>
      )}
    </div>
  );
}
