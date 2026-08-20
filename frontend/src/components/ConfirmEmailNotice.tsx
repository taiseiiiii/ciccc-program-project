import { useState } from "react";
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
      <h1 className="text-headline-md">Confirm your email</h1>
      <p className="text-on-surface-variant text-body-md">
        We sent a confirmation link to <strong>{email}</strong>. Open it to
        finish setting up your account — you&apos;ll be signed in automatically.
      </p>
      <p className="text-on-surface-variant text-label-sm">
        No email? Check your spam folder, or send it again.
      </p>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-error-container text-on-error-container text-body-sm">
          {error}
        </div>
      )}
      {sent && !error && (
        <div role="status" className="p-3 rounded-lg bg-primary-container text-on-primary-container text-body-sm">
          Sent. It can take a minute to arrive.
        </div>
      )}

      <Button type="button" onClick={handleResend} disabled={isSending}>
        {isSending ? "Sending..." : "Resend confirmation email"}
      </Button>
      <Button type="button" variant="secondary" onClick={onBack}>
        Back to log in
      </Button>
    </div>
  );
}
