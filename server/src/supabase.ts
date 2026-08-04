import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export const catalog = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY,
  authOptions,
);

/**
 * Service-role client that bypasses RLS. Use ONLY for recording outcomes the
 * user must not be able to forge (verified payment results). Returns null when
 * the key is not configured.
 */
export function adminClient() {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, authOptions);
}

export function authenticatedClient(token: string) {
  return createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY,
    {
      ...authOptions,
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );
}
