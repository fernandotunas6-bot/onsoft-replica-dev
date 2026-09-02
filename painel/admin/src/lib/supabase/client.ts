import { createBrowserClient } from "@supabase/ssr";

const DEFAULT_SUPABASE_URL = "https://xodgfmxiaunpamctfeea.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NSqtGz5zxP_EngLuNj00Og_y3V4D4td";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

function supabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY
  );
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
