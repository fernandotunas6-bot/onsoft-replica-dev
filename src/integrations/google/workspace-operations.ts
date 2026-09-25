import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkspaceService } from "./workspace-services";

const school = z.object({ schoolId: z.string().uuid() });
const short = z.string().trim().min(1).max(200);
const identifier = z.string().trim().min(1).max(200);
const email = z.string().trim().email().max(254);
const operation = z.discriminatedUnion("action", [
  school.extend({ action: z.literal("drive.list"), pageSize: z.number().int().min(1).max(100).optional() }),
  school.extend({ action: z.literal("drive.page"), pageSize: z.number().int().min(1).max(100).optional(),
    pageToken: z.string().trim().min(1).max(512).optional() }),
  school.extend({ action: z.literal("drive.folder"), name: short, parentId: identifier.optional() }),
  school.extend({ action: z.literal("drive.text"), name: short, text: z.string().max(300_000), parentId: identifier.optional() }),
  school.extend({ action: z.literal("docs.create"), title: short,
    text: z.string().max(200_000).optional() }),
  school.extend({ action: z.literal("sheets.create"), title: short }),
  school.extend({ action: z.literal("sheets.append"), spreadsheetId: identifier,
    range: z.string().trim().min(1).max(180), rows: z.array(z.array(z.union([
      z.string().max(20_000), z.number().finite(),
    ])).max(50)).min(1).max(100) }),
  school.extend({ action: z.literal("classroom.list") }),
  school.extend({ action: z.literal("classroom.create"), name: short, section: z.string().max(100).optional() }),
  school.extend({ action: z.literal("classroom.invite"), courseId: identifier, email,
    role: z.enum(["STUDENT", "TEACHER"]) }),
  school.extend({ action: z.literal("classroom.coursework.create"), courseId: identifier,
    title: short, description: z.string().max(20_000).optional(),
    maxPoints: z.number().finite().min(0).max(1000).optional(),
    dueDate: z.object({
      year: z.number().int().min(2020).max(2200),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
    }).optional() }),
  school.extend({ action: z.literal("calendar.list"), timeMin: z.string().datetime({ offset: true }) }),
  school.extend({ action: z.literal("calendar.delete"), eventId: identifier }),
  school.extend({ action: z.literal("calendar.create"), title: short,
    start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
    description: z.string().max(4000).optional(), location: z.string().max(500).optional(),
    attendees: z.array(email).max(50).optional(),
    recurrence: z.array(z.string().trim().min(1).max(500)).max(5).optional(),
    reminders: z.object({
      useDefault: z.boolean(),
      overrides: z.array(z.object({
        method: z.enum(["email", "popup"]),
        minutes: z.number().int().min(0).max(40320),
      })).max(5).optional(),
    }).optional() }),
  school.extend({ action: z.literal("gmail.send"), to: email,
    subject: short, text: z.string().trim().min(1).max(30_000) }),
  school.extend({ action: z.literal("tasks.list") }),
  school.extend({ action: z.literal("tasks.create"), title: short,
    notes: z.string().max(4000).optional(),
    due: z.string().datetime({ offset: true }).optional() }),
]);

/** Single audited endpoint for optional, individually consented Google services.
 * Vault retrieval verifies the user, school and exact Google scope on EVERY call.
 */
export const executeGoogleWorkspaceOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => operation.parse(value))
  .handler(async ({ data, context }) => {
    if (!context?.userId) throw new Error("É necessário iniciar sessão.");
    if (data.action === "calendar.create" && Date.parse(data.end) <= Date.parse(data.start)) {
      throw new Error("O fim do evento deve ser posterior ao início.");
    }
    const { assertWorkspaceWriteRateLimit } = await import("./workspace-rate-limit.server");
    assertWorkspaceWriteRateLimit({
      userId: context.userId,
      schoolId: data.schoolId,
      action: data.action,
    });
    // Runtime import keeps credentials and privileged database code off the client.
    const { getWorkspaceAccessToken } = await import("./workspace-vault.server");
    const { createWorkspaceApi } = await import("./workspace-api");
    const tokenFor = (service: WorkspaceService) =>
      getWorkspaceAccessToken(context.userId, data.schoolId, service);
    const api = createWorkspaceApi(tokenFor);
    switch (data.action) {
      case "drive.list": return api.driveList(data.pageSize);
      case "drive.page": return api.drivePage(data.pageSize, data.pageToken);
      case "drive.folder": return api.driveFolder(data.name, data.parentId);
      case "drive.text": return api.driveTextFile(data.name, data.text, data.parentId);
      case "docs.create": return api.docsCreate(data.title, data.text);
      case "sheets.create": return api.sheetsCreate(data.title);
      case "sheets.append": return api.sheetsAppend(data.spreadsheetId, data.range, data.rows);
      case "classroom.list": return api.classroomList();
      case "classroom.create": return api.classroomCreate(data.name, data.section);
      case "classroom.invite": return api.classroomInvite(data.courseId, data.email, data.role);
      case "classroom.coursework.create": return api.classroomCourseworkCreate({
        courseId: data.courseId, title: data.title, description: data.description,
        maxPoints: data.maxPoints, dueDate: data.dueDate,
      });
      case "calendar.list": return api.calendarList(data.timeMin);
      case "calendar.delete": return api.calendarDelete(data.eventId);
      case "calendar.create": return api.calendarCreate({
        title: data.title, start: data.start, end: data.end, description: data.description,
        location: data.location, attendees: data.attendees,
        recurrence: data.recurrence, reminders: data.reminders,
      });
      case "gmail.send": return api.gmailSend(data.to, data.subject, data.text);
      case "tasks.list": return api.tasksList();
      case "tasks.create": return api.tasksCreate(data.title, data.notes, data.due);
    }
  });
