/**
 * Google login (Supabase) and Workspace grants are separate OAuth clients.
 * Request only the scopes selected by the signed-in SIGA user.
 * drive.file allows access to files created/opened with the SIGA app, NOT
 * unrestricted access to every file in a personal Drive.
 */
export const GOOGLE_WORKSPACE_SCOPES = {
  drive: ["https://www.googleapis.com/auth/drive.file"],
  docs: ["https://www.googleapis.com/auth/documents"],
  sheets: ["https://www.googleapis.com/auth/spreadsheets"],
  classroom: [
    "https://www.googleapis.com/auth/classroom.courses",
    "https://www.googleapis.com/auth/classroom.coursework.students",
    "https://www.googleapis.com/auth/classroom.rosters",
  ],
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
  tasks: ["https://www.googleapis.com/auth/tasks"],
} as const;
export type WorkspaceService = keyof typeof GOOGLE_WORKSPACE_SCOPES;
export const ALL_WORKSPACE_SERVICES = Object.freeze(
  Object.keys(GOOGLE_WORKSPACE_SCOPES) as WorkspaceService[],
);
export const GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"] as const;
export function validateWorkspaceServices(value: unknown): WorkspaceService[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > ALL_WORKSPACE_SERVICES.length) {
    throw new Error("Seleccione de 1 a 7 serviços Google.");
  }
  const unique = new Set<WorkspaceService>();
  for (const item of value) {
    if (typeof item !== "string" || !Object.hasOwn(GOOGLE_WORKSPACE_SCOPES, item)) {
      throw new Error("Serviço Google desconhecido.");
    }
    unique.add(item as WorkspaceService);
  }
  return [...unique];
}
export function scopesForServices(services: readonly WorkspaceService[]): string[] {
  return [...new Set(services.flatMap((service) => [...GOOGLE_WORKSPACE_SCOPES[service]]))];
}
export function allowedServicesFromScopes(grantedScopes: readonly string[]): WorkspaceService[] {
  const granted = new Set(grantedScopes);
  return ALL_WORKSPACE_SERVICES.filter((service) =>
    GOOGLE_WORKSPACE_SCOPES[service].every((scope) => granted.has(scope)),
  );
}
/** Google responds with space-delimited scope strings. Never trust a client-supplied grant. */
export function parseGrantedScopes(value: unknown): string[] {
  return typeof value === "string" ? [...new Set(value.split(/\s+/).filter(Boolean))] : [];
}
/** Escaping prevents OAuth scope confusion and malformed redirect URLs. */
export function buildGoogleWorkspaceAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  services: readonly WorkspaceService[];
}): string {
  if (!options.clientId || !options.state || !options.codeChallenge) {
    throw new Error("Configuração Google OAuth incompleta.");
  }
  const redirectUri = new URL(options.redirectUri);
  if (redirectUri.protocol !== "https:" &&
    !(redirectUri.protocol === "http:" && ["localhost", "127.0.0.1"].includes(redirectUri.hostname))) {
    throw new Error("Callback OAuth Google tem de utilizar HTTPS.");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: options.clientId,
    redirect_uri: redirectUri.toString(),
    state: options.state,
    scope: [...GOOGLE_IDENTITY_SCOPES, ...scopesForServices(options.services)].join(" "),
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });
  url.search = params.toString();
  return url.toString();
}
