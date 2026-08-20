import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { queryClient } from "./lib/queryClient";
import AppRoutes from "./routes/AppRoutes";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from "react-hot-toast";
import { lazy, Suspense } from "react";

// Devtools only exist in a development build. The package no-ops in production
// anyway, but importing it lazily keeps it out of the production graph entirely
// rather than relying on that.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : null;

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <div className="min-h-screen bg-background text-on-background">
                <Toaster />
                <PWAUpdatePrompt />
                <AppRoutes />
              </div>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
        {ReactQueryDevtools && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
