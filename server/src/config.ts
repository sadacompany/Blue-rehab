import "dotenv/config";
import { z } from "zod";

const DEFAULT_SUPABASE_URL = "https://lfuuptigzjocgewhrmkt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_578u_Ab3cgUlqcXhFiidnQ_MnoAEf9l";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url().default(DEFAULT_SUPABASE_URL),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default(DEFAULT_SUPABASE_PUBLISHABLE_KEY),
});

export const config = schema.parse(process.env);
