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

const STORAGE_KEY_GOOGLE_TOKEN = "siga_google_workspace_token";

/**
 * Builds the Google OAuth 2.0 authorization URL.
 */
export function buildGoogleAuthUrl(options?: {
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
  state?: string;
}): string {
  const clientId =
    options?.clientId ||
    (typeof process !== "undefined" ? process.env?.["GOOGLE_CLIENT_ID"] : undefined) ||
    "445079520865-7jlrh1du2vjp1o1ro3p8o7ms2qo7e8b8.apps.googleusercontent.com";

  const redirectUri =
    options?.redirectUri ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/configuracoes?tab=integracoes&provider=google`
      : "https://portal-siga.com/configuracoes");

  const scopes = options?.scopes || GOOGLE_WORKSPACE_SCOPES;
  const state = options?.state || `siga_${Date.now()}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: scopes.join(" "),
    include_granted_scopes: "true",
    state: state,
    prompt: "consent",
    access_type: "online",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Saves Google OAuth tokens in client storage or memory.
 */
export function saveGoogleOAuthToken(token: GoogleOAuthToken): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_GOOGLE_TOKEN, JSON.stringify(token));
  } catch (err) {
    console.warn("Could not save Google OAuth token to storage:", err);
  }
}

/**
 * Retrieves the stored Google OAuth token if valid.
 */
export function getStoredGoogleOAuthToken(): GoogleOAuthToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GOOGLE_TOKEN);
    if (!raw) return null;
    const token: GoogleOAuthToken = JSON.parse(raw);
    if (token.expiry_date && Date.now() > token.expiry_date) {
      // Expired
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Clears stored Google OAuth credentials.
 */
export function clearGoogleOAuthToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_GOOGLE_TOKEN);
  } catch (err) {
    console.warn("Could not clear Google OAuth token:", err);
  }
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
