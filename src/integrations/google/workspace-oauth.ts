/** Independent, per-user Google Workspace authorization. Never reuse social-login tokens. */
export const WORKSPACE_SCOPES = {
  drive: ["https://www.googleapis.com/auth/drive.file"],
  docs: ["https://www.googleapis.com/auth/documents"],
  sheets: ["https://www.googleapis.com/auth/spreadsheets"],
  classroom: [
    "https://www.googleapis.com/auth/classroom.courses",
    "https://www.googleapis.com/auth/classroom.coursework.students",
  ],
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
  tasks: ["https://www.googleapis.com/auth/tasks"],
} as const;
export type WorkspaceService = keyof typeof WORKSPACE_SCOPES;
export const WORKSPACE_SERVICES = Object.keys(WORKSPACE_SCOPES) as WorkspaceService[];

export function normalizeServices(input: readonly string[]): WorkspaceService[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > WORKSPACE_SERVICES.length) {
    throw new Error("Escolha entre um e sete serviços Google.");
  }
  const unique = [...new Set(input)];
  if (unique.some((service) => !Object.hasOwn(WORKSPACE_SCOPES, service))) {
    throw new Error("Serviço Google desconhecido.");
  }
  return unique as WorkspaceService[];
}

export function scopesForServices(services: readonly WorkspaceService[]): string[] {
  return [...new Set(services.flatMap((service) => [...WORKSPACE_SCOPES[service]]))];
}

export function grantedServices(scopes: readonly string[]): WorkspaceService[] {
  const granted = new Set(scopes);
  return WORKSPACE_SERVICES.filter((service) =>
    WORKSPACE_SCOPES[service].every((scope) => granted.has(scope)),
  );
}

function base64url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256base64url(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(hash));
}

export function randomBase64url(bytes = 48): string {
  if (!Number.isInteger(bytes) || bytes < 32 || bytes > 96) {
    throw new Error("A entropia do OAuth é insuficiente.");
  }
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function createWorkspacePKCE() {
  const verifier = randomBase64url();
  const challenge = await sha256base64url(verifier);
  const state = randomBase64url(32);
  return { verifier, challenge, state };
}

export function workspaceRedirectUri(): string {
  const configured = process.env["GOOGLE_WORKSPACE_REDIRECT_URI"]?.trim();
  if (!configured) throw new Error("GOOGLE_WORKSPACE_REDIRECT_URI por configurar.");
  const url = new URL(configured);
  if (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("O callback OAuth deve utilizar HTTPS.");
  }
  if (url.pathname !== "/api/integrations/google/callback" || url.search || url.hash) {
    throw new Error("Callback Google Workspace inválido.");
  }
  return url.toString();
}

export function buildWorkspaceAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  services: readonly WorkspaceService[];
}): string {
  if (!input.clientId || !input.state || !input.challenge) throw new Error("OAuth incompleto.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [
    "openid", "email", ...scopesForServices(input.services),
  ].join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}
