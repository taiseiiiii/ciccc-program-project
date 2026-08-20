import { useState, useEffect, type ReactNode } from "react";
import { ThemeContext, type Theme } from "../hooks/useTheme";

const STORAGE_KEY = "theme";

/** The `theme_color` meta tag, so the browser chrome matches the app. */
const BROWSER_CHROME: Record<Theme, string> = {
  light: "#0f5640",
  dark: "#0e150f",
};

const prefersDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

/** The climber's own choice, if they have made one. */
function storedTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // First visit follows the device. Defaulting to light meant someone whose
  // phone is in dark mode got a white flash and a light app until they found
  // the toggle.
  const [theme, setTheme] = useState<Theme>(
    () => storedTheme() ?? (prefersDark() ? "dark" : "light"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    // `color-scheme` is what makes the browser render its own controls — date
    // pickers, scrollbars, form fields — for the right theme.
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", BROWSER_CHROME[theme]);
  }, [theme]);

  // Keep following the device until the climber expresses a preference of their
  // own — a phone that flips to dark at sunset should take the app with it.
  // Nothing is written to storage above, precisely so this stays live: an
  // unconditional save on mount would make every visitor look like they had
  // chosen, and this listener would never attach.
  useEffect(() => {
    if (storedTheme()) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (event: MediaQueryListEvent) =>
      setTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  /** An explicit choice, which is the only thing that gets persisted. */
  const toggleTheme = () =>
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
