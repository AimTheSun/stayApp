import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until .env is filled in — App shows a setup notice instead of crashing. */
export const configured = Boolean(url && key && !url.includes("YOUR_PROJECT"));

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  key ?? "placeholder",
);
