import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { disconnectedWorkspaceStatus, unavailableWorkspaceOperation } from "./workspace-security";
import type { WorkspaceService } from "./workspace-services";

async function scopedApi(userId: string) {
  const { resolveSgaMembershipAdmin } = await import("@/integrations/supabase/sga-admin");
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Não existe escola activa associada.");
  const { getWorkspaceAccessToken } = await import("./workspace-vault.server");
  const { createWorkspaceApi } = await import("./workspace-api");
  return { membership, api: createWorkspaceApi((service: WorkspaceService) =>
    getWorkspaceAccessToken(userId, membership.schoolId, service)) };
}


export interface GoogleConnectionStatus {
  connected: boolean;
  userEmail?: string | null;
  services: {
    calendar: boolean;
    gmail: boolean;
    drive: boolean;
    sheets: boolean;
    docs: boolean;
    tasks: boolean;
  };
}

export interface GoogleCalendarEventInput {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  attendees?: string[];
}

export interface GoogleGmailSendInput {
  to: string;
  subject: string;
  bodyHtml: string;
}

export interface GoogleSheetExportInput {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface GoogleTaskInput {
  title: string;
  notes?: string;
  due?: string;
}

export interface GoogleStudentWelcomeEmailInput {
  recipientEmail: string;
  studentName: string;
  studentNumber: string;
  schoolName: string;
  courseName?: string;
  gradeName?: string;
  turmaName?: string;
  shift?: string;
  academicYear?: string;
  schoolPhone?: string;
  schoolEmail?: string;
}

/**
 * Workspace is NOT the Google login provider. Until the separate per-user
 * authorization-code/PKCE flow and server-side encrypted token vault are
 * installed, all server-side Workspace operations must fail closed.
 *
 * In particular, a GOOGLE_CLIENT_ID environment variable does not prove that
 * any user granted Gmail, Calendar, Drive or Tasks scopes.
 */
// Do not pretend to send messages. No email should be marked as delivered.
export const triggerStudentWelcomeEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleStudentWelcomeEmailInput) => data)
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.recipientEmail?.includes("@") || !data.studentName?.trim()) {
      throw new Error("Dados do destinatário inválidos.");
    }
    const { api, membership } = await scopedApi(context.userId);
    const body = [
      `Olá, ${data.studentName}.`,
      `Confirmamos a sua matrícula em ${membership.schoolName ?? "a escola"}.`,
      `Número de processo: ${data.studentNumber}.`,
      data.turmaName ? `Turma: ${data.turmaName}` : "",
      data.academicYear ? `Ano lectivo: ${data.academicYear}` : "",
      "Consulte o portal SIGA para mais informações.",
    ].filter(Boolean).join("\\n");
    const sent = await api.gmailSend(data.recipientEmail, "Confirmação de matrícula — SIGA", body);
    return { success: true, message: `Gmail confirmou o envio: ${sent.id}` };
  });

export const getGoogleWorkspaceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleConnectionStatus> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    const { membership } = await scopedApi(context.userId);
    const { workspaceConnectionStatus } = await import("./workspace-vault.server");
    const status = await workspaceConnectionStatus(context.userId, membership.schoolId);
    const services = new Set(status.services);
    return {
      connected: status.connected, userEmail: status.googleEmail,
      services: {
        gmail: services.has("gmail"), calendar: services.has("calendar"),
        drive: services.has("drive"), docs: services.has("docs"),
        sheets: services.has("sheets"), tasks: services.has("tasks"),
      },
    };
  });

export const syncCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleCalendarEventInput) => data)
  .handler(async (): Promise<{ success: boolean; eventId?: string; message: string }> =>
    unavailableWorkspaceOperation());

export const sendGmailNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleGmailSendInput) => data)
  .handler(async (): Promise<{ success: boolean; messageId?: string; message: string }> =>
    unavailableWorkspaceOperation());

export const exportToGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleSheetExportInput) => data)
  .handler(async (): Promise<{ success: boolean; spreadsheetUrl?: string; message: string }> =>
    unavailableWorkspaceOperation());

export const createGoogleTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleTaskInput) => data)
  .handler(async (): Promise<{ success: boolean; taskId?: string; message: string }> =>
    unavailableWorkspaceOperation());
