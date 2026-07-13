import type { ReactNode, ComponentPropsWithoutRef } from "react";

interface CardProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

export default function Card({
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`bg-surface-container-low border border-outline-variant rounded-xl p-stack-md shadow-sm transition-colors duration-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
