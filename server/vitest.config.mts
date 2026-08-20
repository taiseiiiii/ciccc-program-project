import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node, not jsdom: this package never touches a DOM.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each file gets its own process, so a test that stubs an env var or a
    // module cannot leak that into the next file.
    isolate: true,
  },
});
