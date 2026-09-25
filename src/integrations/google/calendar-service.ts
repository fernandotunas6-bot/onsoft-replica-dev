/**
 * Google Calendar compatibility service.
 * Network access is intentionally routed through authenticated SIGA server functions;
 * browser-held provider tokens are no longer accepted.
 */
import {
  deleteGoogleCalendarEventServerFn,
  listGoogleCalendarEventsServerFn,
  syncCalendarEvent,
} from "./server-workspace";

export interface ClassScheduleData {
  id?: string;
  turmaName: string;
  subjectName: string;
  teacherName?: string;
  roomName?: string;
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  attendeeEmails?: string[];
}

export interface GoogleCalendarEventResponse {
  id: string;
  htmlLink?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

function luandaDateTime(date: string, time: string): string {
  return `${date}T${time}:00+01:00`;
}

function recurrenceFor(schedule: ClassScheduleData): string[] | undefined {
  if (!schedule.endDate || schedule.dayOfWeek === undefined) return undefined;
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const dayCode = days[schedule.dayOfWeek];
  if (!dayCode) return undefined;
  return [`RRULE:FREQ=WEEKLY;BYDAY=${dayCode};UNTIL=${schedule.endDate.replace(/-/g, "")}T225959Z`];
}

/** @deprecated Prefer the domain action that calls syncCalendarEvent directly. */
export async function createCalendarEventFromClassSchedule(
  schedule: ClassScheduleData,
  _customAccessToken?: string,
): Promise<{ success: boolean; event?: GoogleCalendarEventResponse; error?: string }> {
  const date = schedule.startDate ?? new Date().toISOString().slice(0, 10);
  try {
    const result = await syncCalendarEvent({
      data: {
        title: `[SIGA] ${schedule.subjectName} - Turma ${schedule.turmaName}`,
        description: [
          `Aula da disciplina ${schedule.subjectName}`,
          schedule.teacherName ? `Docente: ${schedule.teacherName}` : "",
          schedule.description ? `Notas: ${schedule.description}` : "",
          "Origem: Sistema Integrado de Gestão Académica (SIGA)",
        ].filter(Boolean).join("\n"),
        location: schedule.roomName ? `Sala: ${schedule.roomName}` : undefined,
        attendees: schedule.attendeeEmails,
        startDateTime: luandaDateTime(date, schedule.startTime),
        endDateTime: luandaDateTime(date, schedule.endTime),
        recurrence: recurrenceFor(schedule),
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 15 },
            { method: "email", minutes: 60 },
          ],
        },
      },
    });
    return {
      success: result.success,
      event: result.eventId ? { id: result.eventId } : undefined,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erro ao criar evento." };
  }
}

/** @deprecated Secure compatibility wrapper; provider tokens are server-only. */
export async function listGoogleCalendarEvents(
  timeMin?: string,
  maxResults = 20,
  _customAccessToken?: string,
): Promise<{ success: boolean; items?: GoogleCalendarEventResponse[]; error?: string }> {
  try {
    const result = await listGoogleCalendarEventsServerFn({
      data: { timeMin: timeMin ?? new Date().toISOString(), maxResults },
    });
    return { success: result.success, items: result.items as GoogleCalendarEventResponse[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erro ao listar eventos." };
  }
}

/** @deprecated Secure compatibility wrapper; provider tokens are server-only. */
export async function deleteGoogleCalendarEvent(
  eventId: string,
  _customAccessToken?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteGoogleCalendarEventServerFn({ data: { eventId } });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erro ao apagar evento." };
  }
}
