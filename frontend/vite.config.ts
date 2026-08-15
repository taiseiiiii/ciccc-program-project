import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt" rather than "autoUpdate": an already-open tab keeps running the
      // old build until the user accepts, so a deploy never swaps the bundle out
      // from under someone mid-session. PWAUpdatePrompt renders the offer.
      registerType: "prompt",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "ClimbLog AI",
        short_name: "ClimbLog",
        description: "Log your climbs, track progress, and get AI coaching.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        // Matches the icon's own background, so Chrome's generated splash reads
        // as one continuous green field rather than an icon tile on white —
        // and lands on the same look as the iOS launch images. theme_color is
        // the design system's primary, tinting the Android status bar.
        background_color: "#084d3b",
        theme_color: "#0f5640",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // iOS reads the launch images itself when the app is added to the home
        // screen, and any one device uses exactly one of them. Precaching all
        // 19 would push ~2.4 MB through the service worker for nothing.
        globIgnores: ["**/splash/**"],
        // Mirrors the SPA rewrite in vercel.json so a hard refresh on a deep
        // route resolves the same way offline as it does on the server.
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Stylesheet changes when the font list does, so revalidate in the
            // background rather than pinning a stale one.
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            // Font binaries are content-hashed and immutable.
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Everything unlisted — the Express API and every Supabase call, auth
        // included — falls through to the network untouched. Caching those
        // would serve stale sessions and stale logs.
      },
    }),
  ],
});
