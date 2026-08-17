interface CounterProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  hint?: string;
  /** Accent the number — used for sends, which is the figure worth looking at. */
  emphasis?: boolean;
}

/**
 * A number stepper for the counts on a logged climb: tries, and how many of
 * them topped out.
 *
 * The buttons are the point. This is filled in on a phone at the gym, where
 * "+1" after each go is one thumb tap and a keyboard is a nuisance — the text
 * input is there for correcting a slip, not for normal use.
 */
export default function Counter({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
  hint,
  emphasis = false,
}: CounterProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="flex-1 min-w-0">
      <p className="text-label-md text-on-surface-variant mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="w-10 h-10 shrink-0 rounded-lg bg-surface-container-high text-on-surface text-lg font-bold hover:bg-surface-container-highest disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            // An empty field mid-edit parses as NaN; hold the minimum rather
            // than writing NaN into the draft.
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? clamp(next) : min);
          }}
          className={`w-full min-w-0 text-center px-2 py-2 rounded-lg bg-surface border border-outline text-on-surface tabular-nums focus:border-primary focus:outline-none dark:scheme-dark ${
            emphasis ? "text-primary font-bold" : ""
          }`}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="w-10 h-10 shrink-0 rounded-lg bg-primary text-on-primary text-lg font-bold hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          +
        </button>
      </div>
      {hint && (
        <p className="text-label-sm text-on-surface-variant mt-1.5">{hint}</p>
      )}
    </div>
  );
}
