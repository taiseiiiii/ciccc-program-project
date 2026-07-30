import { useId, type ComponentPropsWithoutRef } from "react";

interface TextareaProps extends ComponentPropsWithoutRef<"textarea"> {
  label?: string;
}

export default function Textarea({
  label,
  className = "",
  ...props
}: TextareaProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-stack-sm w-full font-sans">
      {label && (
        <label className="text-label-md text-on-surface-variant" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        className={`w-full px-4 py-2 rounded-lg text-body-md bg-surface border border-outline transition-colors duration-200 text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none dark:scheme-dark ${className}`}
        id={id}
        {...props}
      />
    </div>
  );
}
