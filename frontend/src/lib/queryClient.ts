import { QueryClient } from "@tanstack/react-query";

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
    },
  },
});
