import type { ComponentProps } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Button from "./Button";

/**
 * Sign out, then land on the auth screen.
 *
 * A thin wrapper over Button rather than a second copy of it — this used to
 * re-declare Button's entire base style and variant map, so every change to
 * Button quietly skipped it. The disabled states, for one, never arrived here.
 */
export default function SignoutButton(props: ComponentProps<typeof Button>) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignout = async () => {
    await signOut();
    navigate("/auth");
  };

  return <Button onClick={handleSignout} {...props} />;
}
