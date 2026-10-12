import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client: bypasses Row Level Security. Only for trusted server
 *  code that has already authenticated the caller another way (the Agent
 *  Studio webhook verifies an HMAC signature). Never import from components. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
