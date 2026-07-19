import type { ReactNode, ComponentPropsWithoutRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { LuLayoutDashboard } from "react-icons/lu";
import { MdOutlineAddToPhotos } from "react-icons/md";
import { BsGraphUpArrow } from "react-icons/bs";
import { LuBotMessageSquare } from "react-icons/lu";
import { CgProfile } from "react-icons/cg";

interface SideNavigationProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

export default function SideNavigation({
  children,
  className = "",
  ...props
}: SideNavigationProps) {
  const getSideNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    const baseClass = "flex flex-row items-center px-3 gap-3 text-body-lg";
    const activeClass = "text-primary font-bold";
    const inactiveClass = "text-on-surface-variant hover:text-primary";

    return `${baseClass} ${isActive ? activeClass : inactiveClass} ${className}`;
  };
  return (
    <div
      className={`h-screen w-64 flex flex-col p-5 gap-stack-md bg-surface-container-low border-r ${className}`}
      {...props}
    >
      <Link
        to={"/"}
        className="text-headline-lg-mobile text-primary font-bold pb-6"
      >
        ClimbLog AI
      </Link>

      <NavLink to="/" end className={getSideNavLinkClass}>
        <LuLayoutDashboard size={24} /> Dashboard
      </NavLink>
      <NavLink to="/log-session" className={getSideNavLinkClass}>
        <MdOutlineAddToPhotos size={24} /> Log session
      </NavLink>
      <NavLink to="/progress" className={getSideNavLinkClass}>
        <BsGraphUpArrow size={24} /> Progress
      </NavLink>
      <NavLink to="/ai-coach" className={getSideNavLinkClass}>
        <LuBotMessageSquare size={24} /> AI coach
      </NavLink>
      <NavLink to={"/profile"} className={getSideNavLinkClass}>
        <CgProfile size={24} /> Profile
      </NavLink>
      {children}
    </div>
  );
}
