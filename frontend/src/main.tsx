import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
// Side-effect import: sets up i18next before any component asks for a string.
import "./i18n";
import { initSentry } from "./lib/sentry";

// Before render, so a crash during the first paint is still reported.
initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
