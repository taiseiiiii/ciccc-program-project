import Card from "../components/Card";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth, type AuthResult } from "../hooks/useAuth";
import Input from "../components/Input";
import Button from "../components/Button";
import ConfirmEmailNotice from "../components/ConfirmEmailNotice";
import {
  isPasskeySupported,
  isUserCancellation,
  signInWithPasskey,
} from "../lib/passkeys";
import RockWall from "../assets/rock-wall.jpg";

const Auth = () => {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Set once we know the account exists but its email is unconfirmed; swaps the
  // form out for the "check your inbox" notice.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);

  /**
   * Sign in with a device credential.
   *
   * No email is typed first: the browser's own prompt lists the passkeys it
   * holds for this site and the climber picks one, which is the whole appeal on
   * a phone. Cancelling that prompt clears the pending state and says nothing —
   * it is a decision, not a failure.
   */
  const handlePasskeySignIn = async () => {
    setIsPasskeyPending(true);
    setErrorMessage(null);
    try {
      await signInWithPasskey();
      navigate("/");
    } catch (err) {
      if (!isUserCancellation(err)) {
        setErrorMessage(
          err instanceof Error ? err.message : t("auth.passkeyFailed"),
        );
      }
    } finally {
      setIsPasskeyPending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);
    setErrorMessage(null);

    const result: AuthResult = isSignUp
      ? await signUp({ email, password, firstName, lastName })
      : await signIn({ email, password });

    // Checked before result.error: signing in as an unconfirmed user is an
    // error, but the useful response is the notice, not the message.
    if (result.needsEmailConfirmation) {
      setUnconfirmedEmail(email);
      setIsSubmitting(false);
      return;
    }
    if (result.error) {
      setErrorMessage(result.error);
      setIsSubmitting(false);
      return;
    }
    navigate("/");
  };

  const handleBackToLogin = () => {
    setUnconfirmedEmail(null);
    setIsSignUp(false);
    setPassword("");
  };

  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center">
      <Card className="flex md:h-auto md:max-w-6xl md:flex-row">
        {/*
          A CSS background rather than an <img>. The panel is hidden below md,
          and browsers skip background images on a display:none element — where
          an <img src> is fetched regardless. This is decoration; a phone should
          not spend a quarter of a megabyte on the sign-in screen to render
          something it will never show.
        */}
        <div
          className="hidden md:flex md:w-1/2 relative bg-cover bg-center items-center justify-center"
          style={{ backgroundImage: `url(${RockWall})` }}
          role="presentation"
        >
          <div className="absolute inset-0 bg-surface-container-lowest/60" />
          <div className="relative z-10 flex flex-col items-center justify-center text-center p-8">
            <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
              {t("auth.heroTitle")}
            </h1>
            <p className="text-on-surface-variant text-body-md mt-2 tracking-tight">
              {t("auth.heroLine1")} <br />
              {t("auth.heroLine2")} <br />
              {t("auth.heroLine3")}
            </p>
          </div>
        </div>
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center">
          {unconfirmedEmail ? (
            <ConfirmEmailNotice
              email={unconfirmedEmail}
              onBack={handleBackToLogin}
            />
          ) : (
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-sm flex flex-col gap-4 p-8"
            >
              <h1 className="text-headline-md">
                {isSignUp ? t("auth.signUpTitle") : t("auth.signInTitle")}
              </h1>
              <p>
                {isSignUp
                  ? t("auth.signUpSubtitle")
                  : t("auth.signInSubtitle")}
              </p>
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3 mb-4 rounded-lg bg-error-container text-on-error-container text-body-sm"
                >
                  {errorMessage}
                </div>
              )}
              {isSignUp && (
                <div className="flex gap-4">
                  <Input
                    type="text"
                    label={t("auth.firstName")}
                    placeholder={t("auth.firstNamePlaceholder")}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    className="capitalize"
                  />
                  <Input
                    type="text"
                    label={t("auth.lastName")}
                    placeholder={t("auth.lastNamePlaceholder")}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoCapitalize="words"
                    autoComplete="family-name"
                    className="capitalize"
                  />
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
              <Input
                type="password"
                label={t("auth.password")}
                placeholder="••••••••"
                value={password}
                required
                // Tells a password manager which of the two flows this is, so
                // signing up offers to generate one and signing in offers the
                // saved one.
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={isSignUp ? 6 : undefined}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t("common:state.loading")
                  : isSignUp
                    ? t("auth.signUpAction")
                    : t("auth.signInAction")}
              </Button>

              {/*
                Only offered for signing in, and only where the browser can do
                it. A passkey has to be added from Profile first, so on the
                sign-up form it would be an option nobody could take.
              */}
              {!isSignUp && isPasskeySupported() && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-outline-variant" />
                    <span className="text-label-sm text-on-surface-variant">
                      {t("auth.or")}
                    </span>
                    <span className="h-px flex-1 bg-outline-variant" />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPasskeyPending}
                    onClick={handlePasskeySignIn}
                  >
                    {isPasskeyPending
                      ? t("auth.waitingForDevice")
                      : t("auth.passkeyCta")}
                  </Button>
                </>
              )}

              <div className="flex flex-row gap-3">
                <p className="text-label-sm md:text-label-md tracking-tight">
                  {isSignUp ? t("auth.haveAccount") : t("auth.noAccount")}
                </p>
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-label-sm md:text-label-md text-on-surface-variant font-bold hover:text-primary"
                >
                  {isSignUp
                    ? t("auth.switchToSignIn")
                    : t("auth.switchToSignUp")}
                </button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Auth;
