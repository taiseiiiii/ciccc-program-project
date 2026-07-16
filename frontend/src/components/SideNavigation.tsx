import type { ReactNode, ComponentPropsWithoutRef } from "react";

interface SideNavigationProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

export default function SideNavigation({
  children,
  className = "",
  ...props
}: SideNavigationProps) {
  return (
    <div
      className={`h-screen w-64 bg-surface-container-low border-r ${className}`}
      {...props}
    >
      <p>Side nav bar</p>
      {children}
    </div>
  );
}
