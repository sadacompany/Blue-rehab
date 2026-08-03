import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export const catalog = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY,
  authOptions,
);

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
