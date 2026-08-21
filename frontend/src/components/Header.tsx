import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ComponentPropsWithoutRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { CgProfile } from "react-icons/cg";
import { FiSun, FiMoon } from "react-icons/fi";

/**
 * Route to catalogue key. The text itself lives in common.json under
 * `shell.pages`, because this map is module-level and cannot call `t` — a new
 * route needs an entry here *and* there, or its header falls back to the app
 * name.
 */
const PAGE_KEYS: Record<string, string> = {
  "/": "dashboard",
  "/log-session": "logSession",
  "/sessions": "sessions",
  "/import": "import",
  "/progress": "progress",
  "/ai-coach": "aiCoach",
  "/injuries": "injuries",
  "/profile": "profile",
};

export default function Header({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"header">) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const { t } = useTranslation();

  const pageKey = PAGE_KEYS[location.pathname];
  const currentPage = pageKey
    ? {
        title: t(`shell.pages.${pageKey}.title`),
        subtitle: t(`shell.pages.${pageKey}.subtitle`),
      }
    : { title: t("app.name"), subtitle: t("shell.tagline") };

  useEffect(() => {
    document.title = `${currentPage.title} | ${t("app.name")}`;
  }, [currentPage.title, t]);

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
          {t("app.name")}
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
          aria-label={t(
            theme === "dark" ? "shell.theme.toLight" : "shell.theme.toDark",
          )}
        >
          {theme === "dark" ? <FiSun size={22} /> : <FiMoon size={22} />}
        </button>
        <NavLink
          to="/profile"
          aria-label={t("nav.profile")}
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
