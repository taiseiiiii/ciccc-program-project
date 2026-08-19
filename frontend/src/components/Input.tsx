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
    <div className="flex flex-col gap-stack-sm w-full font-sans">
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
