import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateWorkspaceServices } from "./workspace-services";

const startInput = z.object({
  schoolId: z.string().uuid(),
  services: z.array(z.string()).min(1).max(7),
});
const finishInput = z.object({
  code: z.string().min(3).max(8192),
  state: z.string().min(32).max(512),
});
const schoolInput = z.object({ schoolId: z.string().uuid() });

function requireSessionId(claims: Record<string, unknown>): string {
  const sessionId = claims["session_id"];
  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error("Não foi possível identificar a sessão autenticada. Entre novamente.");
  }
  return sessionId;
}

/** Starts a *second* Google OAuth consent, unrelated to Supabase sign-in. */
export const startGoogleWorkspaceOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => startInput.parse(raw))
  .handler(async ({ data, context }) => {
    if (!context?.userId) throw new Error("Sessão SIGA em falta.");
    const services = validateWorkspaceServices(data.services);
    const { startWorkspaceConsent } = await import("./workspace-vault.server");
    return startWorkspaceConsent({
      userId: context.userId, schoolId: data.schoolId,
      sessionId: requireSessionId(context.claims), services,
    });
  });

/** The callback page invokes this over an authenticated SIGA server function. */
export const completeGoogleWorkspaceOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => finishInput.parse(raw))
  .handler(async ({ data, context }) => {
    if (!context?.userId) throw new Error("Inicie sessão no SIGA antes de ligar o Google.");
    const { completeWorkspaceConsent } = await import("./workspace-vault.server");
    return completeWorkspaceConsent({
      userId: context.userId, sessionId: requireSessionId(context.claims),
      code: data.code, state: data.state,
    });
  });

export const getGoogleWorkspaceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => schoolInput.parse(raw))
  .handler(async ({ data, context }) => {
    if (!context?.userId) throw new Error("Inicie sessão no SIGA.");
    const { workspaceConnectionStatus } = await import("./workspace-vault.server");
    return workspaceConnectionStatus(context.userId, data.schoolId);
  });

export const disconnectGoogleWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => schoolInput.parse(raw))
  .handler(async ({ data, context }) => {
    if (!context?.userId) throw new Error("Inicie sessão no SIGA.");
    const { disconnectWorkspace } = await import("./workspace-vault.server");
    return disconnectWorkspace(context.userId, data.schoolId);
  });
