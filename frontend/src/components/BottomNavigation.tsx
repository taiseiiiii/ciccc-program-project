import type { ComponentPropsWithoutRef } from "react";
import { NavLink } from "react-router-dom";
import { LuLayoutDashboard, LuBotMessageSquare, LuBandage } from "react-icons/lu";
import { MdOutlineAddToPhotos } from "react-icons/md";
import { BsGraphUpArrow } from "react-icons/bs";

/**
 * The phone's navigation. Five items, not four.
 *
 * Injuries used to be desktop-only, on the reasoning that four is what fits and
 * this is the screen most climbers open least. The problem with that: the only
 * other way in was the dashboard's injury banner, which appears once you
 * already have an open injury — so a climber who tweaked a finger at the gym,
 * on their phone, had no path to record it at all. Five fits at these sizes.
 */
const LINKS = [
  { to: "/", end: true, label: "Dashboard", Icon: LuLayoutDashboard },
  { to: "/log-session", label: "Log", Icon: MdOutlineAddToPhotos },
  { to: "/progress", label: "Progress", Icon: BsGraphUpArrow },
  { to: "/ai-coach", label: "Coach", Icon: LuBotMessageSquare },
  { to: "/injuries", label: "Injuries", Icon: LuBandage },
] as const;

export default function BottomNavigation({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"nav">) {
  return (
    <nav
      aria-label="Main"
      className={`flex flex-row justify-around fixed bottom-0 left-0 h-16 w-full px-1 py-2 bg-surface-container-low border-t border-outline-variant ${className}`}
      {...props}
    >
      {LINKS.map(({ to, label, Icon, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          {...rest}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 text-label-sm ${
              isActive ? "text-primary" : "text-on-surface-variant hover:text-primary"
            }`
          }
        >
          <Icon size={22} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
