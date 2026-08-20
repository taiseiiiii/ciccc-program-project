import type { ReactNode, ComponentPropsWithoutRef } from "react";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "error";
}

const VARIANTS = {
  primary: "bg-primary text-on-primary hover:bg-primary-container",
  secondary:
    "bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
  error: "bg-error text-on-error hover:bg-error-container",
} as const;

const BASE =
  "px-4 py-2 rounded-lg font-sans text-label-md transition-all active:scale-95 cursor-pointer " +
  // A pending mutation should look pending: drop the affordances that say
  // "clickable" rather than leaving the button fully lit but inert.
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

export default function Button({
  children,
  variant = "primary",
  className = "",
  // Defaulted, because a <button> with no type is a submit button — so the
  // moment one of these lands inside a <form> it would submit it.
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
