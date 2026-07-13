import type { ReactNode, ComponentPropsWithoutRef } from "react";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "error";
}

export default function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  // Setting on the baseStyle and styles"
  const baseStyle =
    "px-4 py-2 rounded-lg font-sans text-label-md transition-all active:scale-95 cursor-pointer";
  const styles = {
    primary: "bg-primary text-on-primary hover:bg-primary-container",
    secondary:
      "bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
    error: "bg-error text-on-error hover:bg-error-container",
  };
  return (
    <button
      className={`${baseStyle} ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
