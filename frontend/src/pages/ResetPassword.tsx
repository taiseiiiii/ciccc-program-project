import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";

/** Matches the minimum Supabase enforces, and the sign-up form. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Where the emailed reset link lands.
 *
 * The link carries a recovery token; supabase-js reads it out of the URL on
 * load and turns it into a session, which is what authorises the update below.
 * So "is there a session" is also the answer to "was this link any good" — an
 * expired or already-used link leaves none, and a bare visit to this path has
 * none either. Both get the same explanation.
 *
 * Deliberately outside both route guards. RequireAuth would bounce the arriving
 * user to /auth before the token was read, and RedirectIfAuthed would bounce
 * them to the dashboard the moment it was — with the old password still set.
 */
export default function ResetPassword() {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const { session, loading, updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("resetPassword.mismatch"));
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await updatePassword(password);
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // The recovery token already signed them in, so there is nowhere to send
    // them but into the app.
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        {loading ? (
          <p className="text-on-surface-variant animate-pulse">
            {t("common:state.loading")}
          </p>
        ) : !session ? (
          <div className="flex flex-col gap-3">
            <h1 className="text-headline-sm font-bold">
              {t("resetPassword.invalidTitle")}
            </h1>
            <p className="text-on-surface-variant text-body-md">
              {t("resetPassword.invalidBody")}
            </p>
            <Link to="/auth" className="text-primary font-medium hover:underline">
              {t("resetPassword.backToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h1 className="text-headline-sm font-bold">
              {t("resetPassword.title")}
            </h1>
            <p className="text-on-surface-variant text-body-md">
              {t("resetPassword.body")}
            </p>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-error-container text-on-error-container text-body-sm"
              >
                {error}
              </div>
            )}

            <Input
              type="password"
              label={t("resetPassword.newPassword")}
              placeholder="••••••••"
              value={password}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              type="password"
              label={t("resetPassword.confirmPassword")}
              placeholder="••••••••"
              value={confirm}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" disabled={isSaving}>
              {isSaving ? t("resetPassword.saving") : t("resetPassword.save")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
