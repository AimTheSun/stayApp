import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until .env is filled in — App shows a setup notice instead of crashing. */
export const configured = Boolean(url && key && !url.includes("YOUR_PROJECT"));

// All Supabase traffic goes through same-origin /sb (Vercel rewrite in prod,
// Vite dev proxy locally) — keeps phones with filtered networks working.
export const supabase = createClient(
  configured ? `${window.location.origin}/sb` : "https://placeholder.supabase.co",
  // `||` (not `??`) so an empty-string env var also falls back — an empty key
  // makes createClient throw, which would blank the page before React mounts.
  key || "placeholder",
);
