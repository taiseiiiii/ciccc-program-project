import type { ReactNode, ComponentPropsWithoutRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { CgProfile } from "react-icons/cg";

interface HeaderProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

export default function Header({
  children,
  className = "",
  ...props
}: HeaderProps) {
  const getSideNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    const baseClass = "flex flex-row items-center px-3 gap-3 text-body-lg";
    const activeClass = "text-primary font-bold";
    const inactiveClass = "text-on-surface-variant hover:text-primary";

    return `${baseClass} ${isActive ? activeClass : inactiveClass} ${className}`;
  };
  return (
    <div className={`${className}`}>
      <div
        className="flex flex-row items-center justify-between fixed top-0 left-0 h-16 w-full p-2 z-10 bg-surface-container-low border-b"
        {...props}
      >
        <Link
          to={"/"}
          className="text-headline-lg-mobile text-primary font-bold"
        >
          ClimbLog AI
        </Link>
        <NavLink to="/profile" className={getSideNavLinkClass}>
          <CgProfile size={24} />
        </NavLink>
        {children}
      </div>
    </div>
  );
}
