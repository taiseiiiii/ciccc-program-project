import type { ReactNode, ComponentPropsWithoutRef } from "react";
import { NavLink } from "react-router-dom";
import { LuLayoutDashboard } from "react-icons/lu";
import { MdOutlineAddToPhotos } from "react-icons/md";
import { BsGraphUpArrow } from "react-icons/bs";
import { LuBotMessageSquare } from "react-icons/lu";

interface BottomNavigationProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

export default function BottomNavigation({
  children,
  className = "",
  ...props
}: BottomNavigationProps) {
  const bottomNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    const baseClass = "flex flex-col items-center gap-1 text-label-sm";
    const activeClass = "text-primary";
    const inactiveClass = "text-on-surface-variant hover:text-primary";

    return `${baseClass} ${isActive ? activeClass : inactiveClass} ${className}`;
  };
  return (
    <div
      className={`flex flex-row justify-around fixed bottom-0 left-0 h-16 w-full p-2 bg-surface-container-low border-t ${className}`}
      {...props}
    >
      <NavLink to={"/"} className={bottomNavLinkClass}>
        <LuLayoutDashboard size={24} />
        Dashboard
      </NavLink>
      <NavLink to={"/log-session"} className={bottomNavLinkClass}>
        <MdOutlineAddToPhotos size={24} /> Log
      </NavLink>
      <NavLink to={"/progress"} className={bottomNavLinkClass}>
        <BsGraphUpArrow size={24} /> Progress
      </NavLink>
      <NavLink to={"/ai-coach"} className={bottomNavLinkClass}>
        <LuBotMessageSquare size={24} />
        Coach
      </NavLink>
      {children}
    </div>
  );
}
