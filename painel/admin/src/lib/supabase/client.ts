import { createBrowserClient } from "@supabase/ssr";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

function supabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function createClient() {
  const url = supabaseUrl();
  const key = supabaseAnonKey();

  if (!url || !key) {
    throw new Error(
      "Supabase ADMIN não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createBrowserClient(url, key);
}
