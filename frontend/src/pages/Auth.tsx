import Card from "../components/Card";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type AuthResult } from "../context/AuthContext";
import Input from "../components/Input";
import Button from "../components/Button";
import ConfirmEmailNotice from "../components/ConfirmEmailNotice";
import RockWall from "../assets/rock-wall.jpg";

const Auth = () => {
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
        <div className="hidden md:flex md:w-1/2 relative bg-cover bg-center items-center justify-center">
          <img
            src={RockWall}
            alt=""
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-surface-container-lowest/60" />
          <div className="relative z-10 flex flex-col items-center justify-center text-center p-8">
            <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
              Elevate your performance with data-driven insights.
            </h1>
            <p className="text-on-surface-variant text-body-md mt-2 tracking-tight">
              Turn every attempt into valuable progress. <br />
              Visualize your strengths and focus areas. <br />
              Start sending your dream grades today.
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
                {isSignUp ? "Sign up" : "Welcome back"}
              </h1>
              <p>
                {isSignUp
                  ? "Create your account!"
                  : "Log in to continue your training session."}
              </p>
              {errorMessage && (
                <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                  {errorMessage}
                </div>
              )}
              {isSignUp && (
                <div className="flex gap-4">
                  <Input
                    type="text"
                    label="Firstname"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoCapitalize="words"
                    className="capitalize"
                  />
                  <Input
                    type="text"
                    label="Lastname"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoCapitalize="words"
                    className="capitalize"
                  />
                </div>
              )}
              <Input
                type="email"
                label="Email address"
                placeholder="climbLogAI@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                label="Password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="submit"
                disabled={isSubmitting}
                className={isSubmitting ? "opacity-50 cursor-not-allowed" : ""}
              >
                {isSubmitting
                  ? "Loading..."
                  : isSignUp
                    ? "Sign up →"
                    : "Log in →"}
              </Button>
              <div className="flex flex-row gap-3">
                <p className="text-label-sm md:text-label-md tracking-tight">
                  {isSignUp
                    ? "Already have an account?"
                    : "Don't have an account?"}
                </p>
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-label-sm md:text-label-md text-on-surface-variant font-bold hover:text-primary"
                >
                  {isSignUp ? "Log in" : "Create account"}
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
