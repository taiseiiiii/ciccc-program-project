import { Component, type ErrorInfo, type ReactNode } from "react";
import Button from "./Button";
import Card from "./Card";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render error and shows something, rather than a white page.
 *
 * Without this, one bad field in one API response — a null where a component
 * indexes into an array, say — unmounts the entire app and leaves the climber
 * looking at nothing at all, with no way back short of retyping the URL.
 *
 * Still a class component: React has no hook equivalent of
 * `componentDidCatch`.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing ships these anywhere yet, but the console is where a teammate
    // will look first, and the component stack is the useful half.
    console.error("[ui] render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md flex flex-col gap-3">
          <h1 className="text-headline-sm font-bold text-on-surface">
            Something broke on this screen
          </h1>
          <p className="text-on-surface-variant">
            Nothing you logged has been lost — this is a display problem, not a
            saving one. Reloading usually clears it.
          </p>
          <p className="text-label-sm text-on-surface-variant font-mono break-words">
            {this.state.error.message}
          </p>
          <div className="flex gap-3">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Back to dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}
