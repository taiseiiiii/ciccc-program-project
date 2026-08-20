import type { ComponentPropsWithoutRef } from "react";
import { Link, NavLink } from "react-router-dom";
import SignoutButton from "./SignoutButton";
import { LuLayoutDashboard, LuBotMessageSquare, LuBandage } from "react-icons/lu";
import { MdOutlineAddToPhotos } from "react-icons/md";
import { BsGraphUpArrow } from "react-icons/bs";

const LINKS = [
  { to: "/", end: true, label: "Dashboard", Icon: LuLayoutDashboard },
  { to: "/log-session", label: "Log session", Icon: MdOutlineAddToPhotos },
  { to: "/progress", label: "Progress", Icon: BsGraphUpArrow },
  { to: "/ai-coach", label: "AI coach", Icon: LuBotMessageSquare },
  { to: "/injuries", label: "Injuries", Icon: LuBandage },
] as const;

export default function SideNavigation({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"nav">) {
  return (
    <nav
      aria-label="Main"
      className={`h-screen w-64 flex flex-col p-5 gap-stack-md bg-surface-container-low border-r border-outline-variant ${className}`}
      {...props}
    >
      <Link
        to="/"
        className="text-headline-lg-mobile text-primary font-bold pb-6"
      >
        ClimbLog AI
      </Link>

      {LINKS.map(({ to, label, Icon, ...rest }) => (
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
          {label}
        </NavLink>
      ))}

      <div className="mt-auto">
        <SignoutButton
          variant="error"
          className="flex items-center mt-8 mx-3 px-3 gap-3"
        >
          Sign Out
        </SignoutButton>
      </div>
    </nav>
  );
}
