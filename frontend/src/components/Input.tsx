import { useId, type ComponentPropsWithRef } from "react";

/**
 * `ComponentPropsWithRef` rather than `WithoutRef`: a caller that rejects a
 * field needs to be able to scroll to it and focus it. React 19 passes `ref`
 * through as an ordinary prop, so the spread below is all it takes.
 */
interface InputProps extends ComponentPropsWithRef<"input"> {
  label?: string;
}

export default function Input({ label, className = "", ...props }: InputProps) {
  const id = useId();

  return (
    // `min-w-0` matters as soon as this sits in a flex or grid row. Both
    // layouts default an item's min-width to its content, and a `type="date"`
    // control's native spinner fields are wider than the track it is given —
    // without this the field ignores its share of the row and overflows.
    <div className="flex flex-col gap-stack-sm w-full min-w-0 font-sans">
      {label && (
        <label className="text-label-md text-on-surface-variant" htmlFor={id}>
          {label}
          {/* Marked, not just enforced: a field that is rejected on submit
              without ever having looked mandatory reads as a broken button. */}
          {props.required && (
            <span className="text-error" aria-hidden="true">
              {" *"}
            </span>
          )}
        </label>
      )}
      <input
        className={`w-full px-4 py-2 rounded-lg text-body-md bg-surface border border-outline transition-colors duration-200 text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none dark:scheme-dark ${className}`}
        id={id}
        {...props}
      />
    </div>
  );
}
