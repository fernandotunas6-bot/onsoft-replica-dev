/**
 * Google Workspace OAuth 2.0 Management for SIGA
 * Seamlessly manages Google permissions alongside Supabase Auth sessions.
 */

export interface GoogleOAuthToken {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date?: number;
  email?: string;
}

export const GOOGLE_WORKSPACE_SCOPES = [
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

/**
 * Builds the Google OAuth 2.0 authorization URL.
 */
export function buildGoogleAuthUrl(_options?: {
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
  state?: string;
}): string {
  // No response_type=token: legacy implicit grant is disabled.
  // Workspace must use its own server-side PKCE authorization and token vault,
  // distinct from Supabase Auth's Google sign-in callback.
  throw new Error(
    "A ligação Google Workspace requer OAuth PKCE e armazenamento seguro no servidor.",
  );
}

let workspaceToken: GoogleOAuthToken | null = null;

// Purge bearer tokens persisted by earlier Workspace builds.
function purgeLegacyTokenStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("siga_google_workspace_token");
    window.localStorage.removeItem("siga_google_workspace_oauth_token");
  } catch { /* Storage may be disabled. */ }
}
purgeLegacyTokenStorage();

/** Short-lived in-memory compatibility only; never persist provider tokens in localStorage. */
export function saveGoogleOAuthToken(token: GoogleOAuthToken): void {
  purgeLegacyTokenStorage();
  // Temporary backwards compatibility for callers that already hold a token.
  // Do not accept refresh tokens in browser memory or immortal tokens.
  const now = Date.now();
  const expiryDate = token.expiry_date ?? now + 15 * 60_000;
  if (!token.access_token || !Number.isFinite(expiryDate) || expiryDate <= now) {
    workspaceToken = null;
    return;
  }
  workspaceToken = {
    access_token: token.access_token,
    token_type: token.token_type,
    scope: token.scope,
    expiry_date: Math.min(expiryDate, now + 60 * 60_000),
    ...(token.email ? { email: token.email } : {}),
  };
}

export function getStoredGoogleOAuthToken(): GoogleOAuthToken | null {
  if (!workspaceToken) return null;
  if (workspaceToken.expiry_date && Date.now() > workspaceToken.expiry_date) {
    workspaceToken = null;
  }
  return workspaceToken ? { ...workspaceToken } : null;
}

export function clearGoogleOAuthToken(): void {
  workspaceToken = null;
  purgeLegacyTokenStorage();
}

/**
 * Checks if the user currently has granted permissions for Google Calendar and Gmail.
 */
export function checkGooglePermissions(): {
  hasCalendar: boolean;
  hasGmail: boolean;
  hasDrive: boolean;
  hasSheets: boolean;
  hasTasks: boolean;
  isConnected: boolean;
  email?: string;
} {
  const token = getStoredGoogleOAuthToken();
  if (!token || !token.access_token) {
    return {
      hasCalendar: false,
      hasGmail: false,
      hasDrive: false,
      hasSheets: false,
      hasTasks: false,
      isConnected: false,
    };
  }

  const scopes = token.scope || "";
  return {
    hasCalendar: scopes.includes("calendar"),
    hasGmail: scopes.includes("gmail"),
    hasDrive: scopes.includes("drive"),
    hasSheets: scopes.includes("spreadsheets"),
    hasTasks: scopes.includes("tasks"),
    isConnected: true,
    ...(token.email !== undefined ? { email: token.email } : {}),
  };
}
