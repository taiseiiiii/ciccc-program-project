import Card from "../components/Card";
import { useState } from "react";
import Input from "../components/Input";
import Button from "../components/Button";
import RockWall from "../assets/rock-wall.jpg";

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);

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
            <h1 className="text-on-surface text-headline-md font-bold">
              Elevate your performance with data-driven insights.
            </h1>
            <p className="text-on-surface-variant text-body-md mt-2">
              Turn every attempt into valuable progress. <br />
              Visualize your strengths and focus areas. <br />
              Start sending your dream grades today.
            </p>
          </div>
        </div>
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center">
          <div className="w-full max-w-sm flex flex-col gap-4 p-8">
            <h1 className="text-headline-md">
              {isSignUp ? "Sign up" : "Welcome back"}
            </h1>
            <p>
              {isSignUp
                ? "Create your account!"
                : "Log in to continue your training session."}
            </p>
            {isSignUp && (
              <Input
                type="text"
                label="Username"
                placeholder="Climbing lover"
              ></Input>
            )}
            <Input
              type="email"
              label="Email address"
              placeholder="climbLogAI@email.com"
            ></Input>
            <Input
              type="password"
              label="Password"
              placeholder="••••••••"
            ></Input>
            <Button type="submit">{isSignUp ? "Sign in →" : "Log in →"}</Button>
            <div className="flex flex-row gap-3">
              <p className="text-label-sm md:text-label-md">
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
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Auth;
