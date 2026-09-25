import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { WorkspaceService } from "./workspace-services";

async function scopedApi(userId: string, action?: string) {
  const { resolveSgaMembershipAdmin } = await import("@/integrations/supabase/sga-admin");
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Não existe escola activa associada.");
  if (action) {
    const { assertWorkspaceWriteRateLimit } = await import("./workspace-rate-limit.server");
    assertWorkspaceWriteRateLimit({ userId, schoolId: membership.schoolId, action });
  }
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
    classroom: boolean;
  };
}

export interface GoogleCalendarEventInput {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  attendees?: string[];
  recurrence?: string[];
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: "email" | "popup"; minutes: number }>;
  };
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

const email = z.string().trim().email().max(254);
const shortText = z.string().trim().min(1).max(200);
const optionalText = (max: number) => z.string().trim().max(max).optional();

const welcomeSchema = z.object({
  recipientEmail: email,
  studentName: shortText,
  studentNumber: shortText,
  schoolName: shortText,
  courseName: optionalText(200),
  gradeName: optionalText(200),
  turmaName: optionalText(200),
  shift: optionalText(100),
  academicYear: optionalText(100),
  schoolPhone: optionalText(80),
  schoolEmail: email.optional(),
});

const calendarEventSchema = z.object({
  title: shortText,
  description: optionalText(4000),
  startDateTime: z.string().datetime({ offset: true }),
  endDateTime: z.string().datetime({ offset: true }),
  location: optionalText(500),
  attendees: z.array(email).max(50).optional(),
  recurrence: z.array(z.string().trim().min(1).max(500)).max(5).optional(),
  reminders: z.object({
    useDefault: z.boolean(),
    overrides: z.array(z.object({
      method: z.enum(["email", "popup"]),
      minutes: z.number().int().min(0).max(40320),
    })).max(5).optional(),
  }).optional(),
});

const gmailSchema = z.object({
  to: email,
  subject: shortText,
  bodyHtml: z.string().trim().min(1).max(50_000),
});

const sheetSchema = z.object({
  title: shortText,
  headers: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
  rows: z.array(z.array(z.union([
    z.string().max(20_000),
    z.number().finite(),
  ])).max(50)).max(500),
});

const taskSchema = z.object({
  title: shortText,
  notes: optionalText(4000),
  due: z.string().datetime({ offset: true }).optional(),
});

/**
 * Workspace is separate from Google sign-in. Each operation resolves the
 * current user's active school and requires a matching encrypted OAuth grant.
 * Report success only after Google confirms the actual operation.
 * Authentication emails (reset and magic links) stay on branded Resend.
 */
export const triggerStudentWelcomeEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => welcomeSchema.parse(raw))
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.recipientEmail?.includes("@") || !data.studentName?.trim()) {
      throw new Error("Dados do destinatário inválidos.");
    }
    const { api, membership } = await scopedApi(context.userId, "gmail.send");
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
        classroom: services.has("classroom"),
      },
    };
  });

export const syncCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => calendarEventSchema.parse(raw))
  .handler(async ({ data, context }): Promise<{ success: boolean; eventId?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.title?.trim() ||
        !Number.isFinite(Date.parse(data.startDateTime)) ||
        Date.parse(data.endDateTime) <= Date.parse(data.startDateTime)) {
      throw new Error("Evento ou intervalo de datas inválido.");
    }
    const { api } = await scopedApi(context.userId, "calendar.create");
    const event = await api.calendarCreate({
      title: data.title, start: data.startDateTime,
      end: data.endDateTime, description: data.description,
      location: data.location, attendees: data.attendees,
      recurrence: data.recurrence, reminders: data.reminders,
    });
    return { success: true, eventId: event.id,
      message: "Google Calendar confirmou a criação do evento." };
  });

export const listGoogleCalendarEventsServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({
    timeMin: z.string().datetime({ offset: true }).optional(),
    maxResults: z.number().int().min(1).max(100).optional(),
  }).parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    const { api } = await scopedApi(context.userId);
    const items = await api.calendarList(data.timeMin ?? new Date().toISOString());
    return { success: true, items: items.slice(0, data.maxResults ?? 20) };
  });

export const deleteGoogleCalendarEventServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ eventId: z.string().trim().min(1).max(500) }).parse(raw))
  .handler(async ({ data, context }) => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    const { api } = await scopedApi(context.userId, "calendar.delete");
    await api.calendarDelete(data.eventId);
    return { success: true };
  });
export const sendGmailNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => gmailSchema.parse(raw))
  .handler(async ({ data, context }): Promise<{ success: boolean; messageId?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.to?.includes("@") || !data.subject?.trim() || !data.bodyHtml?.trim()) {
      throw new Error("Destinatário, assunto ou mensagem inválidos.");
    }
    const { api } = await scopedApi(context.userId, "gmail.send");
    const text = data.bodyHtml.replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").trim();
    const message = await api.gmailSend(data.to, data.subject, text);
    return { success: true, messageId: message.id, message: "Gmail confirmou o envio." };
  });

export const exportToGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => sheetSchema.parse(raw))
  .handler(async ({ data, context }): Promise<{ success: boolean; spreadsheetUrl?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.title?.trim() || !data.headers?.length ||
        data.headers.length > 50 || data.rows.length > 500 ||
        data.rows.some((row) => row.length !== data.headers.length)) {
      throw new Error("Relatório Sheets inválido ou demasiado extenso.");
    }
    const { api } = await scopedApi(context.userId, "sheets.create");
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
  .validator((raw: unknown) => taskSchema.parse(raw))
  .handler(async ({ data, context }): Promise<{ success: boolean; taskId?: string; message: string }> => {
    if (!context?.userId) throw new Error("Sessão SIGA obrigatória.");
    if (!data.title?.trim()) throw new Error("Título da tarefa obrigatório.");
    const { api } = await scopedApi(context.userId, "tasks.create");
    const task = await api.tasksCreate(data.title, data.notes, data.due);
    return { success: true, taskId: task.id,
      message: "Google Tasks confirmou a criação da tarefa." };
  });
