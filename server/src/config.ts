import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Local development only.
//
// `npm run dev -w server` runs with the workspace as cwd, so a bare
// `dotenv/config` looks for server/.env and silently misses the repo-root .env
// that docs/SETUP.md tells you to create. Resolve both relative to this file
// instead of the cwd. dotenv does not overwrite already-set keys, so the order
// here is the precedence order: real environment > server/.env > root .env.
//
// Guarded because this module is also bundled into the Netlify function, where
// esbuild emits CJS and `import.meta.url` is undefined — an unguarded
// fileURLToPath() there throws at import time and takes down the whole API.
// Serverless has no .env on disk regardless; Netlify injects real env vars.
try {
  const here = dirname(fileURLToPath(import.meta.url));
  loadEnv({ path: resolve(here, "../.env"), quiet: true });
  loadEnv({ path: resolve(here, "../../.env"), quiet: true });
} catch {
  // Bundled build — nothing to load from disk.
}

const DEFAULT_SUPABASE_URL = "https://jmgfabzsgrukrzpnuhux.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_eCJHRbegR3FVk1Hbu3Kbgw_aMoMwvNb";

const optionalSecret = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => (value ? value : undefined));

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url().default(DEFAULT_SUPABASE_URL),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default(DEFAULT_SUPABASE_PUBLISHABLE_KEY),

  // Google Meet via the free Google Calendar API. All optional: when unset the
  // platform keeps working and simply skips Meet-link creation for remote sessions.
  GOOGLE_OAUTH_CLIENT_ID: optionalSecret,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalSecret,
  GOOGLE_OAUTH_REFRESH_TOKEN: optionalSecret,
  GOOGLE_CALENDAR_ID: z.string().trim().min(1).default("primary"),
  GOOGLE_MEET_TIME_ZONE: z.string().trim().min(1).default("Asia/Riyadh"),

  // Moyasar payment gateway. The SECRET key must never reach the browser.
  // Use the sk_test_/pk_test_ pair while testing; live keys charge real cards.
  MOYASAR_SECRET_KEY: optionalSecret,
  MOYASAR_PUBLISHABLE_KEY: optionalSecret,

  // Service-role key, used ONLY to record a verified payment outcome (the
  // paying user must not be able to mark their own payment as succeeded).
  // Without it the callback still verifies but cannot persist the result.
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,

  // Public origin used to build payment callback URLs.
  PUBLIC_SITE_URL: z.string().url().default("http://localhost:5173"),
});

export const config = schema.parse(process.env);
