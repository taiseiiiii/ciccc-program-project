import { useEffect } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { CgProfile } from "react-icons/cg";
import { FiSun, FiMoon } from "react-icons/fi";

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
  "/injuries": {
    title: "Injuries",
    subtitle: "Track what hurts and keep training away from it",
  },
  "/profile": {
    title: "Profile & Settings",
    subtitle: "Manage your climbing grades and account preferences",
  },
};

export default function Header({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"header">) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const currentPage = PAGE_TITLES[location.pathname] ?? {
    title: "ClimbLog AI",
    subtitle: "Elite Climbing Progression",
  };

  useEffect(() => {
    document.title = `${currentPage.title} | ClimbLog AI`;
  }, [currentPage.title]);

  return (
    <header
      className={`flex flex-row items-center justify-between fixed top-0 left-0 md:left-64 right-0 h-16 p-2 z-10 bg-surface-container-low border-b border-outline-variant ${className}`}
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
        <div className="flex items-baseline gap-2.5 min-w-0">
          <p className="text-base text-primary font-bold tracking-tight whitespace-nowrap">
            {currentPage.title}
          </p>
          {currentPage.subtitle && (
            <span className="text-xs text-on-surface-variant truncate font-normal min-w-0">
              — {currentPage.subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-row items-center gap-1">
        <button
          type="button"
          className="cursor-pointer rounded-lg p-2 text-on-surface-variant hover:text-primary"
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? <FiSun size={22} /> : <FiMoon size={22} />}
        </button>
        <NavLink
          to="/profile"
          aria-label="Profile"
          className={({ isActive }) =>
            `rounded-lg p-2 ${
              isActive
                ? "text-primary"
                : "text-on-surface-variant hover:text-primary"
            }`
          }
        >
          <CgProfile size={22} />
        </NavLink>
      </div>
    </header>
  );
}
