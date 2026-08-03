import "dotenv/config";
import { z } from "zod";

const DEFAULT_SUPABASE_URL = "https://lfuuptigzjocgewhrmkt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_578u_Ab3cgUlqcXhFiidnQ_MnoAEf9l";

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
});

export const config = schema.parse(process.env);
