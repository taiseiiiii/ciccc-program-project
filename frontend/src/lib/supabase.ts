import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loudly here: with the vars missing, createClient throws from deep inside
// the SDK and the real cause (no .env.local) is easy to miss.
if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill them in — see SUPABASE_SETUP.md.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Face ID / Touch ID / Windows Hello sign-in. The passkey methods throw
    // without this flag, and it is marked experimental by the SDK — the API may
    // change, so everything that touches it goes through lib/passkeys.ts and
    // degrades to the password flow when it is unavailable.
    experimental: { passkey: true },
  },
});
