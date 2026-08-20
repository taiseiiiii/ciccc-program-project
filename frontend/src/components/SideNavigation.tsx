import type { ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import SignoutButton from "./SignoutButton";
import {
  LuLayoutDashboard,
  LuBotMessageSquare,
  LuBandage,
  LuHistory,
} from "react-icons/lu";
import { MdOutlineAddToPhotos } from "react-icons/md";
import { BsGraphUpArrow } from "react-icons/bs";

const LINKS = [
  { to: "/", end: true, labelKey: "nav.dashboard", Icon: LuLayoutDashboard },
  { to: "/log-session", labelKey: "nav.logSession", Icon: MdOutlineAddToPhotos },
  // Desktop only, deliberately: the bottom bar on mobile is already at five
  // items, and this screen is reachable from Dashboard and Progress there.
  { to: "/sessions", labelKey: "nav.sessions", Icon: LuHistory },
  { to: "/progress", labelKey: "nav.progress", Icon: BsGraphUpArrow },
  { to: "/ai-coach", labelKey: "nav.aiCoach", Icon: LuBotMessageSquare },
  { to: "/injuries", labelKey: "nav.injuries", Icon: LuBandage },
] as const;

export default function SideNavigation({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"nav">) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("nav.mainLabel")}
      className={`h-screen w-64 flex flex-col p-5 gap-stack-md bg-surface-container-low border-r border-outline-variant ${className}`}
      {...props}
    >
      <Link
        to="/"
        className="text-headline-lg-mobile text-primary font-bold pb-6"
      >
        {t("app.name")}
      </Link>

      {LINKS.map(({ to, labelKey, Icon, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          {...rest}
          className={({ isActive }) =>
            `flex flex-row items-center px-3 gap-3 text-body-lg ${
              isActive
                ? "text-primary font-bold"
                : "text-on-surface-variant hover:text-primary"
            }`
          }
        >
          <Icon size={24} aria-hidden="true" />
          {t(labelKey)}
        </NavLink>
      ))}

      <div className="mt-auto">
        <SignoutButton
          variant="error"
          className="flex items-center mt-8 mx-3 px-3 gap-3"
        >
          {t("action.signOut")}
        </SignoutButton>
      </div>
    </nav>
  );
}
