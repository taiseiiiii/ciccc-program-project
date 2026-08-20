import { Component, type ErrorInfo, type ReactNode } from "react";
import Button from "./Button";
import Card from "./Card";
import { captureError } from "../lib/sentry";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const RELOAD_KEY = "climblog:chunk-reload-at";

// A tab left open across a deploy still holds the old bundle's chunk hashes.
// Every page here is lazy-loaded, so the first navigation after a deploy asks
// for a chunk that no longer exists and the dynamic import rejects. The wording
// differs per browser, hence the union.
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;

/**
 * Guards against reloading in a loop. A stale chunk is fixed by exactly one
 * reload; if the same error survives it, the deploy itself is broken and the
 * climber is better off seeing the message than watching the tab thrash.
 */
function shouldAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last < 10_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    // Private mode with storage disabled: skip the reload rather than risk it.
    return false;
  }
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
    if (CHUNK_ERROR.test(error.message) && shouldAutoReload()) {
      window.location.reload();
      return;
    }
    // The console is where a teammate will look first, and the component stack
    // is the useful half. Sentry gets both — the console alone is on a device
    // nobody here can read.
    console.error("[ui] render error", error, info.componentStack);
    captureError(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isStaleBundle = CHUNK_ERROR.test(this.state.error.message);

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md flex flex-col gap-3">
          <h1 className="text-headline-sm font-bold text-on-surface">
            {isStaleBundle
              ? "A new version is available"
              : "Something broke on this screen"}
          </h1>
          <p className="text-on-surface-variant">
            {isStaleBundle
              ? "This tab is running an older copy of the app. Reloading picks up the new one — nothing you logged is affected."
              : "Nothing you logged has been lost — this is a display problem, not a saving one. Reloading usually clears it."}
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
