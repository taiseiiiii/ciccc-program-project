import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/**
 * Lives in its own module (not App.tsx) so that components and non-React code
 * can import it without pulling in the component tree — exporting it from
 * App.tsx created a circular import (App → routes → pages → App) and broke
 * Fast Refresh. Inside components, prefer the useQueryClient() hook.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Serve cached data for a minute before refetching in the background.
      // The v5 default of 0 refetches every query on each mount/focus, which
      // this app's data (master data + user-owned rows) doesn't need.
      staleTime: 60 * 1000,
      // Retrying a 4xx just repeats a request the server already rejected on
      // its merits — three times, with backoff, before the user sees the
      // message that was ready immediately. Network and 5xx failures are the
      // ones worth retrying.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.isClientError) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // A mutation is a write. Replaying one blindly can double-log a session.
      retry: false,
    },
  },
});
