/**
 * Google Workspace OAuth 2.0 Management for SIGA
 * Seamlessly manages Google permissions (Calendar, Gmail) alongside existing Supabase sessions.
 */

export interface GoogleOAuthSession {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expires_in?: number;
  expiry_date?: number;
  email?: string;
  picture?: string;
  name?: string;
}

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const GOOGLE_TOKEN_STORAGE_KEY = "siga_google_workspace_oauth_token";

function purgeLegacyTokenStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem("siga_google_workspace_token");
  } catch { /* Storage may be disabled. */ }
}
purgeLegacyTokenStorage();

/**
 * Builds Google OAuth 2.0 authorization URL using configured client ID.
 */
export function getGoogleOAuthUrl(_options?: {
  redirectUri?: string;
  scopes?: string[];
  state?: string;
  prompt?: string;
}): string {
  throw new Error(
    "OAuth Workspace implícito desactivado. Configure autorização PKCE separada no servidor.",
  );
}

const memoryStorage: Record<string, string> = {};

// Transient compatibility storage only. OAuth refresh tokens require a
// server-side encrypted vault, never browser storage.
function getStorage() {
  return {
    getItem: (k: string) => memoryStorage[k] ?? null,
    setItem: (k: string, v: string) => { memoryStorage[k] = v; },
    removeItem: (k: string) => { delete memoryStorage[k]; },
  };
}

/**
 * Stores only a transient in-memory Workspace token, never the Supabase session.
 */
export function saveGoogleOAuthToken(token: GoogleOAuthSession): void {
  try {
    const computedExpiry = token.expires_in
      ? Date.now() + token.expires_in * 1000
      : token.expiry_date || Date.now() + 3600 * 1000;

    const payload = {
      ...token,
      expiry_date: computedExpiry,
    };
    getStorage().setItem(GOOGLE_TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error("Failed to store Google OAuth token:", e);
  }
}

/**
 * Reads stored Google OAuth token if active and valid.
 */
export function getStoredGoogleOAuthToken(): GoogleOAuthSession | null {
  try {
    const raw = getStorage().getItem(GOOGLE_TOKEN_STORAGE_KEY);
    if (!raw) return null;

    const session: GoogleOAuthSession = JSON.parse(raw);
    if (session.expiry_date && Date.now() > session.expiry_date) {
      return null; // Expired
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Clears Google OAuth session.
 */
export function clearGoogleOAuthToken(): void {
  try {
    getStorage().removeItem(GOOGLE_TOKEN_STORAGE_KEY);
  } catch (e) {
    console.warn("Could not clear Google OAuth token:", e);
  }
}

/**
 * Parses hash fragment from Google OAuth redirect (implicit grant).
 */
export function parseGoogleOAuthCallback(_hash: string): GoogleOAuthSession | null {
  // Implicit-flow fragments may contain bearer tokens in the browser URL.
  // They are deliberately rejected; use the separate Workspace PKCE flow.
  return null;
}
