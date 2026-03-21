import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Admin client — bypasses RLS. Use for server-side operations. */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

/** Create a client scoped to a user's JWT (respects RLS). */
export function supabaseForUser(accessToken: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
