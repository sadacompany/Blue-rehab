import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://jmgfabzsgrukrzpnuhux.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_eCJHRbegR3FVk1Hbu3Kbgw_aMoMwvNb";

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(url, key);
