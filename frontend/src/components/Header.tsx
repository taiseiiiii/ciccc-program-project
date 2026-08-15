import type { ReactNode, ComponentPropsWithoutRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { CgProfile } from "react-icons/cg";
import { FiSun } from "react-icons/fi";
import { FiMoon } from "react-icons/fi";

interface HeaderProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/": {
    title: "Dashboard",
    subtitle: "Overview of your recent climbing activities",
  },
  "/log-session": {
    title: "Log Session",
    subtitle: "Record today's attempts, routes, and notes",
  },
  "/progress": {
    title: "Performance Analytics",
    subtitle: "Track your send rates, consistency, and active goals",
  },
  "/ai-coach": {
    title: "AI Coaching Intelligence",
    subtitle: "Personalized insights and drill recommendations",
  },
  "/profile": {
    title: "Profile & Settings",
    subtitle: "Manage your climbing grades and account preferences",
  },
};

export default function Header({
  children,
  className = "",
  ...props
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const currentPage = PAGE_TITLES[location.pathname] ?? {
    title: "ClimbLog AI",
    subtitle: "Elite Climbing Progression",
  };

  const getSideNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    const baseClass = "flex flex-row items-center px-3 gap-3 text-body-lg";
    const activeClass = "text-primary font-bold";
    const inactiveClass = "text-on-surface-variant hover:text-primary";

    return `${baseClass} ${isActive ? activeClass : inactiveClass} ${className}`;
  };
  return (
    <div className={`${className}`}>
      <div
        className="flex flex-row items-center justify-between fixed top-0 left-0 md:left-64 right-0 h-16 p-2 z-10 bg-surface-container-low border-b"
        {...props}
      >
        <div className="flex md:hidden items-center">
          <Link
            to="/"
            className="text-headline-lg-mobile text-primary font-bold tracking-tight"
          >
            ClimbLog AI
          </Link>
        </div>

        <div className="hidden md:flex flex-col justify-center min-w-0 pr-4">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base text-primary font-bold text-foreground tracking-tight whitespace-nowrap">
              {currentPage.title}
            </h1>
            {currentPage.subtitle && (
              <span className="text-xs text-secondary text-muted-foreground truncate font-normal">
                — {currentPage.subtitle}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-row items-center justify-center">
          <button
            className="text-body-lg text-on-surface-variant hover:text-primary"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <FiSun size={24} /> : <FiMoon size={24} />}
          </button>
          <NavLink to="/profile" className={getSideNavLinkClass}>
            <CgProfile size={24} />
          </NavLink>
        </div>
        {children}
      </div>
    </div>
  );
}
