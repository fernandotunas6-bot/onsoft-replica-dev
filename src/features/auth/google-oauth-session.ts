import type { Session } from "@supabase/supabase-js";

/**
 * Check Google sessions on both first sign-in and restored sessions.
 * A sessionStorage marker supplements provider metadata during the redirect.
 */
export function shouldVerifyGoogleOAuthSession(
  session: Pick<Session, "user"> | null,
  oauthPending = false,
): boolean {
  if (!session) return false;
  return oauthPending || session.user.app_metadata?.provider === "google";
}
