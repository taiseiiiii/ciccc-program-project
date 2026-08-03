import { createContext, useContext } from "react";

export interface ThemeContextType {
  theme: string;
  toggleTheme: () => void;
}

/**
 * The context object and hook live here, apart from ThemeProvider
 * (context/ThemeContext.tsx), so that file exports only a component and Fast
 * Refresh keeps working on it (react-refresh/only-export-components).
 */
export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined,
);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme should be inside of the ThemeProvider");
  }
  return context;
}
