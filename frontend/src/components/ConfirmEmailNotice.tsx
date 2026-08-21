import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import Button from "./Button";
import { useAuth } from "../hooks/useAuth";

interface ConfirmEmailNoticeProps {
  /** Address the confirmation link was sent to. */
  email: string;
  /** Return to the sign-in form (e.g. to correct a typo in the address). */
  onBack: () => void;
}

/**
 * Shown when an account exists but its email has not been confirmed yet —
 * reached either straight after signing up, or by trying to sign in first.
 * Without this the user just sees an unchanged form and no explanation, since
 * Supabase issues no session until the emailed link is clicked.
 */
export default function ConfirmEmailNotice({
  email,
  onBack,
}: ConfirmEmailNoticeProps) {
  const { t } = useTranslation("profile");
  const { resendConfirmation } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    setIsSending(true);
    setError(null);
    const result = await resendConfirmation(email);
    setIsSending(false);
    if (result.error) {
      // Most often the send rate limit — the message says so.
      setError(result.error);
      return;
    }
    setSent(true);
  };

  return (
    <div className="w-full max-w-sm flex flex-col gap-4 p-8">
      <h1 className="text-headline-md">{t("confirmEmail.title")}</h1>
      <p className="text-on-surface-variant text-body-md">
        <Trans
          i18nKey="confirmEmail.body"
          ns="profile"
          values={{ email }}
          components={{ email: <strong /> }}
        />
      </p>
      <p className="text-on-surface-variant text-label-sm">
        {t("confirmEmail.noEmail")}
      </p>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-error-container text-on-error-container text-body-sm">
          {error}
        </div>
      )}
      {sent && !error && (
        <div role="status" className="p-3 rounded-lg bg-primary-container text-on-primary-container text-body-sm">
          {t("confirmEmail.sent")}
        </div>
      )}

      <Button type="button" onClick={handleResend} disabled={isSending}>
        {isSending ? t("confirmEmail.sending") : t("confirmEmail.resend")}
      </Button>
      <Button type="button" variant="secondary" onClick={onBack}>
        {t("confirmEmail.backToLogin")}
      </Button>
    </div>
  );
}
