import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const payflowSupabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "siga-payflow-auth",
        },
      })
    : null;

export async function getPayflowSession(): Promise<Session | null> {
  if (!payflowSupabase) return null;
  const { data } = await payflowSupabase.auth.getSession();
  return data.session;
}

export async function signInPayflow(email: string, password: string) {
  if (!payflowSupabase) throw new Error("Supabase não configurado no PayFlow.");
  const { data, error } = await payflowSupabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOutPayflow() {
  if (!payflowSupabase) return;
  const { error } = await payflowSupabase.auth.signOut();
  if (error) throw error;
}
