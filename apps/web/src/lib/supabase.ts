import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in apps/web/.env",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Keep the user signed in across reloads / tab closes.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
