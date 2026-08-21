import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import Input from "./Input";
import Button from "./Button";

interface ForgotPasswordFormProps {
  /** Address already typed into the sign-in form, so it is not typed twice. */
  initialEmail: string;
  /** Return to the sign-in form. */
  onBack: () => void;
}

/**
 * Ask for a reset link.
 *
 * Until this existed there was no way back into an account whose password had
 * been forgotten: sign-up, sign-in and passkeys were the only auth flows the
 * app called, so a locked-out climber needed someone with dashboard access.
 *
 * Success is reported for any address, registered or not — see
 * AuthContext.requestPasswordReset for why.
 */
export default function ForgotPasswordForm({
  initialEmail,
  onBack,
}: ForgotPasswordFormProps) {
  const { t } = useTranslation("profile");
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSending(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setIsSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="w-full max-w-sm flex flex-col gap-4 p-8">
        <h1 className="text-headline-md">{t("forgotPassword.sentTitle")}</h1>
        <p className="text-on-surface-variant text-body-md">
          <Trans
            i18nKey="forgotPassword.sentBody"
            ns="profile"
            values={{ email }}
            components={{ email: <strong /> }}
          />
        </p>
        <p className="text-on-surface-variant text-label-sm">
          {t("forgotPassword.noEmail")}
        </p>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t("forgotPassword.backToLogin")}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm flex flex-col gap-4 p-8"
    >
      <h1 className="text-headline-md">{t("forgotPassword.title")}</h1>
      <p className="text-on-surface-variant text-body-md">
        {t("forgotPassword.body")}
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
        type="email"
        label={t("auth.email")}
        placeholder="climbLogAI@email.com"
        value={email}
        required
        autoComplete="email"
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" disabled={isSending}>
        {isSending ? t("forgotPassword.sending") : t("forgotPassword.send")}
      </Button>
      <Button type="button" variant="secondary" onClick={onBack}>
        {t("forgotPassword.backToLogin")}
      </Button>
    </form>
  );
}
