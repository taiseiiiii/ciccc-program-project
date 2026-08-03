import { useAuth } from "../hooks/useAuth";
import type { ReactNode, ComponentPropsWithoutRef } from "react";
import { useNavigate } from "react-router-dom";

interface SignoutButtonProps extends ComponentPropsWithoutRef<"button"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "error";
}

export default function SignoutButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: SignoutButtonProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignout = async () => {
    await signOut();
    navigate("/auth");
  };

  const baseStyle =
    "px-4 py-2 rounded-lg font-sans text-label-md transition-all active:scale-95 cursor-pointer";
  const styles = {
    primary: "bg-primary text-on-primary hover:bg-primary-container",
    secondary:
      "bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
    error: "bg-error text-on-error hover:bg-error-container",
  };
  return (
    <button
      onClick={handleSignout}
      className={`${baseStyle} ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
