import { ApiError, type SessionTransport } from "./api";

/** Structural subset of the existing Supabase browser client; no second client,
 * keys, token storage or alternative MFA implementation is created here. */
export interface SupabaseSessionClient {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token: string; user: { id: string } } | null };
      error: unknown;
    }>;
    signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
    onAuthStateChange(
      callback: (event: string, session: { user: { id: string } } | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}
export function supabaseSessionTransport(client: SupabaseSessionClient): SessionTransport {
  let knownUser: string | null | undefined;
  return {
    async accessToken() {
      // The existing SDK owns refresh, MFA and storage. This is transport only;
      // the server verifies the user and assurance level before authorisation.
      const { data, error } = await client.auth.getSession();
      if (error) throw new ApiError(503, "Não foi possível obter a sessão Supabase.");
      if (knownUser === undefined) knownUser = data.session?.user.id ?? null;
      return data.session?.access_token || null;
    },
    async clearSession() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new ApiError(503, "Não foi possível terminar a sessão Supabase.");
      knownUser = null;
    },
    subscribeSessionChanged(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const nextUser = session?.user.id ?? null;
        const changedUser = knownUser !== undefined && knownUser !== nextUser;
        knownUser = nextUser;
        // Same-user refresh/focus events do not repeatedly reset school choice.
        // No async Supabase call is made inside this callback (SDK auth lock).
        if (
          changedUser ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED" ||
          event === "MFA_CHALLENGE_VERIFIED"
        )
          listener();
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
