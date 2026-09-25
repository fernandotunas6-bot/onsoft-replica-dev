import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
 * Workspace is separate from Google sign-in. Each operation resolves the
 * current user's active school and requires a matching encrypted OAuth grant.
 * Report success only after Google confirms the actual operation.
 * Authentication emails (reset and magic links) stay on branded Resend.
 */
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
    ].filter(Boolean).join("\n");
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
  .handler(async ({ data, context }): Promise<{ success: boolean; eventId?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.title?.trim() ||
        !Number.isFinite(Date.parse(data.startDateTime)) ||
        Date.parse(data.endDateTime) <= Date.parse(data.startDateTime)) {
      throw new Error("Evento ou intervalo de datas inválido.");
    }
    const { api } = await scopedApi(context.userId);
    const event = await api.calendarCreate({
      title: data.title, start: data.startDateTime,
      end: data.endDateTime, description: data.description,
    });
    return { success: true, eventId: event.id,
      message: "Google Calendar confirmou a criação do evento." };
  });

export const sendGmailNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleGmailSendInput) => data)
  .handler(async ({ data, context }): Promise<{ success: boolean; messageId?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.to?.includes("@") || !data.subject?.trim() || !data.bodyHtml?.trim()) {
      throw new Error("Destinatário, assunto ou mensagem inválidos.");
    }
    const { api } = await scopedApi(context.userId);
    const text = data.bodyHtml.replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").trim();
    const message = await api.gmailSend(data.to, data.subject, text);
    return { success: true, messageId: message.id, message: "Gmail confirmou o envio." };
  });

export const exportToGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleSheetExportInput) => data)
  .handler(async ({ data, context }): Promise<{ success: boolean; spreadsheetUrl?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.title?.trim() || !data.headers?.length ||
        data.headers.length > 50 || data.rows.length > 500 ||
        data.rows.some((row) => row.length !== data.headers.length)) {
      throw new Error("Relatório Sheets inválido ou demasiado extenso.");
    }
    const { api } = await scopedApi(context.userId);
    const sheet = await api.sheetsCreate(data.title);
    const expected = data.rows.length + 1;
    const appended = await api.sheetsAppend(
      sheet.spreadsheetId, "A1", [data.headers, ...data.rows],
    );
    if (appended.updatedRows < expected) {
      throw new Error("Folha criada, mas o Google não confirmou todas as linhas.");
    }
    return {
      success: true,
      spreadsheetUrl: sheet.spreadsheetUrl ??
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheet.spreadsheetId)}`,
      message: `Google Sheets confirmou ${appended.updatedRows} linhas.`,
    };
  });

export const createGoogleTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleTaskInput) => data)
  .handler(async ({ data, context }): Promise<{ success: boolean; taskId?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.title?.trim()) throw new Error("Título da tarefa obrigatório.");
    const { api } = await scopedApi(context.userId);
    const task = await api.tasksCreate(data.title, data.notes);
    return { success: true, taskId: task.id,
      message: "Google Tasks confirmou a criação da tarefa." };
  });
