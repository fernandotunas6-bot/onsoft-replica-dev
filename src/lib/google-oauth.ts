/**
 * Google Workspace OAuth 2.0 Management for SIGA
 * Seamlessly manages Google permissions (Calendar, Gmail) alongside existing Supabase sessions.
 */

import configJson from "../../firebase-applet-config.json";

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

/**
 * Builds Google OAuth 2.0 authorization URL using configured client ID.
 */
export function getGoogleOAuthUrl(options?: {
  redirectUri?: string;
  scopes?: string[];
  state?: string;
  prompt?: string;
}): string {
  const clientId =
    (configJson as { oAuthClientId?: string }).oAuthClientId ||
    "445079520865-7jlrh1du2vjp1o1ro3p8o7ms2qo7e8b8.apps.googleusercontent.com";

  const redirectUri =
    options?.redirectUri ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/configuracoes`
      : "https://portal-siga.com/configuracoes");

  const scopes = options?.scopes || GOOGLE_OAUTH_SCOPES;
  const state = options?.state || `siga_auth_${Date.now()}`;

  const queryParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: scopes.join(" "),
    include_granted_scopes: "true",
    state,
    prompt: options?.prompt || "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${queryParams.toString()}`;
}

let memoryStorage: Record<string, string> = {};

function getStorage():
  | Storage
  | {
      getItem: (k: string) => string | null;
      setItem: (k: string, v: string) => void;
      removeItem: (k: string) => void;
    } {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return {
    getItem: (k: string) => memoryStorage[k] ?? null,
    setItem: (k: string, v: string) => {
      memoryStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete memoryStorage[k];
    },
  };
}

/**
 * Stores Google OAuth token into localStorage without affecting Supabase auth.
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
export function parseGoogleOAuthCallback(hash: string): GoogleOAuthSession | null {
  if (!hash || !hash.includes("access_token")) return null;

  const cleanHash = hash.startsWith("#") ? hash.substring(1) : hash;
  const params = new URLSearchParams(cleanHash);
  const accessToken = params.get("access_token");

  if (!accessToken) return null;

  const session: GoogleOAuthSession = {
    access_token: accessToken,
    token_type: params.get("token_type") || "Bearer",
    expires_in: params.get("expires_in") ? Number(params.get("expires_in")) : 3600,
    scope: params.get("scope") || "",
  };

  saveGoogleOAuthToken(session);
  return session;
}
