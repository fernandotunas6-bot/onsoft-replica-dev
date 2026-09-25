import { GOOGLE_WORKSPACE_SCOPES } from "./workspace-services";

/**
 * Compatibility surface used by tests and older status consumers.
 * Keep a single source of truth for scopes in workspace-services.ts.
 */
export const GOOGLE_WORKSPACE_SCOPES_BY_SERVICE = GOOGLE_WORKSPACE_SCOPES;

export const WORKSPACE_NOT_CONFIGURED =
  "Google Workspace não está ligado. É necessária autorização separada para o serviço solicitado.";

/** @deprecated Real operations must throw or return the Google-confirmed result. */
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
      classroom: false,
    },
  };
}
