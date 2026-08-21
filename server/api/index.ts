/**
 * The Vercel entry point.
 *
 * Vercel invokes a function rather than running a server, so there is no
 * `listen` here — the platform hands the exported handler each request. An
 * Express application *is* that handler: `app(req, res)` is exactly the
 * signature Node's http server calls, so the app can be exported as-is.
 *
 * `src/index.ts` is still the entry point for `pnpm dev` and for anywhere the
 * app runs as a long-lived process; it binds a port and handles shutdown
 * signals, neither of which apply here.
 */
import { initSentry } from "../src/observability/sentry";
import { createApp } from "../src/app";

// Before the app is built, so anything that fails during setup is reported too.
initSentry();

export default createApp();
