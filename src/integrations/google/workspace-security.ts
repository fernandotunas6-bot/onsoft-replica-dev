/**
 * Google Workspace is a separate, optional integration. Signing in to SIGA
 * through Supabase Auth never grants Gmail, Calendar, Drive or Sheets access.
 * Each service needs its own explicit Google consent and server-side vault.
 */
export const GOOGLE_WORKSPACE_SCOPES_BY_SERVICE = {
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  sheets: ["https://www.googleapis.com/auth/spreadsheets"],
  drive: ["https://www.googleapis.com/auth/drive.file"],
  docs: ["https://www.googleapis.com/auth/documents"],
  tasks: ["https://www.googleapis.com/auth/tasks"],
} as const;

export const WORKSPACE_NOT_CONFIGURED =
  "Google Workspace não está ligado. É necessária autorização separada para o serviço solicitado.";

export function unavailableWorkspaceOperation() {
  return { success: false as const, message: WORKSPACE_NOT_CONFIGURED };
}

export function disconnectedWorkspaceStatus() {
  return {
    connected: false,
    userEmail: null,
    services: {
      calendar: false,
      gmail: false,
      drive: false,
      sheets: false,
      docs: false,
      tasks: false,
    },
  };
}
