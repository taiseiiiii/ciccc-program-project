import type { ReactNode, ComponentPropsWithoutRef } from "react";

interface BottomNavigationProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

export default function BottomNavigation({
  children,
  className = "",
  ...props
}: BottomNavigationProps) {
  return (
    <div
      className={`fixed bottom-0 left-0 h-16 w-full bg-surface-container-low border-t ${className}`}
      {...props}
    >
      <p>This is a bottom nav bar</p>
      {children}
    </div>
  );
}
