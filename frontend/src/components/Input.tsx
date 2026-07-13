import type { ComponentPropsWithoutRef } from "react";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label?: string;
}

export default function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-stack-sm w-full font-sans">
      {label && (
        <label className="text-label-md text-on-surface-variant">{label}</label>
      )}
      <input
        className={`w-full px-4 py-2 rounded-lg text-body-md bg-surface border border-outline transition-colors duration-200 text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none ${className}`}
        {...props}
      />
    </div>
  );
}
