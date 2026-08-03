import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://lfuuptigzjocgewhrmkt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_578u_Ab3cgUlqcXhFiidnQ_MnoAEf9l";

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(url, key);
