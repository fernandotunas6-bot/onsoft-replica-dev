import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
const WORKSPACE_NOT_CONFIGURED =
  "Google Workspace não está ligado. É necessária autorização separada para o serviço solicitado.";

const unavailable = () => ({ success: false, message: WORKSPACE_NOT_CONFIGURED });

// Do not pretend to send messages. No email should be marked as delivered.
export const triggerStudentWelcomeEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleStudentWelcomeEmailInput) => data)
  .handler(async (): Promise<{ success: boolean; message: string }> => unavailable());

export const getGoogleWorkspaceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<GoogleConnectionStatus> => ({
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
  }));

export const syncCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleCalendarEventInput) => data)
  .handler(async (): Promise<{ success: boolean; eventId?: string; message: string }> =>
    unavailable());

export const sendGmailNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleGmailSendInput) => data)
  .handler(async (): Promise<{ success: boolean; messageId?: string; message: string }> =>
    unavailable());

export const exportToGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleSheetExportInput) => data)
  .handler(async (): Promise<{ success: boolean; spreadsheetUrl?: string; message: string }> =>
    unavailable());

export const createGoogleTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GoogleTaskInput) => data)
  .handler(async (): Promise<{ success: boolean; taskId?: string; message: string }> =>
    unavailable());
