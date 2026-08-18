/**
 * Google Calendar API Service for SIGA
 * Maps Supabase class/lesson data to automatic Google Calendar events for teachers and classes.
 */

import { getStoredGoogleOAuthToken } from "./google-oauth";

export interface SupabaseClassEventData {
  scheduleId?: string;
  turmaId?: string;
  turmaName: string;
  disciplineName: string;
  teacherName?: string;
  teacherEmail?: string;
  roomName?: string;
  dayOfWeek?: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "07:30" or "13:00"
  endTime: string; // "09:00" or "14:30"
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD"
  notes?: string;
  studentEmails?: string[];
}

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
  attendees?: Array<{ email: string; displayName?: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";

/**
 * Maps Supabase class and timetable data to Google Calendar Event format
 */
export function mapSupabaseClassToGoogleEvent(
  classData: SupabaseClassEventData,
  timeZone = "Africa/Luanda",
): GoogleCalendarEvent {
  const baseDate = classData.startDate || new Date().toISOString().split("T")[0];
  const startDateTime = `${baseDate}T${classData.startTime}:00`;
  const endDateTime = `${baseDate}T${classData.endTime}:00`;

  const attendees: Array<{ email: string; displayName?: string }> = [];
  if (classData.teacherEmail) {
    attendees.push({
      email: classData.teacherEmail,
      displayName: classData.teacherName || "Professor",
    });
  }
  if (classData.studentEmails && classData.studentEmails.length > 0) {
    classData.studentEmails.forEach((email) => {
      attendees.push({ email });
    });
  }

  const event: GoogleCalendarEvent = {
    summary: `[SIGA] ${classData.disciplineName} - Turma ${classData.turmaName}`,
    location: classData.roomName ? `Sala: ${classData.roomName}` : undefined,
    description: [
      `Aula da disciplina: ${classData.disciplineName}`,
      classData.teacherName ? `Professor(a): ${classData.teacherName}` : "",
      `Turma: ${classData.turmaName}`,
      classData.notes ? `Observações: ${classData.notes}` : "",
      `Sistema Integrado de Gestão Académica (SIGA)`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
    attendees: attendees.length > 0 ? attendees : undefined,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 15 },
        { method: "email", minutes: 60 },
      ],
    },
  };

  // Setup weekly recurrence if semester / school year end date is provided
  if (classData.endDate && classData.dayOfWeek !== undefined) {
    const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const dayCode = days[classData.dayOfWeek] || "MO";
    const untilFormatted = classData.endDate.replace(/-/g, "") + "T235959Z";
    event.recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${dayCode};UNTIL=${untilFormatted}`];
  }

  return event;
}

/**
 * Creates an event in Google Calendar using stored OAuth credentials.
 */
export async function createGoogleCalendarClassEvent(
  classData: SupabaseClassEventData,
  customAccessToken?: string,
): Promise<{ success: boolean; eventId?: string; link?: string; error?: string }> {
  const token = customAccessToken || getStoredGoogleOAuthToken()?.access_token;
  if (!token) {
    return {
      success: false,
      error: "Sessão Google Workspace não autenticada. Conecte sua conta Google no SIGA.",
    };
  }

  const payload = mapSupabaseClassToGoogleEvent(classData);

  try {
    const response = await fetch(`${CALENDAR_BASE_URL}/calendars/primary/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        error: `Google Calendar API error (${response.status}): ${errText}`,
      };
    }

    const created = await response.json();
    return {
      success: true,
      eventId: created.id,
      link: created.htmlLink,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro inesperado ao criar evento no Google Calendar",
    };
  }
}

/**
 * Batch sync a teacher's schedule to Google Calendar.
 */
export async function syncTeacherScheduleToGoogleCalendar(
  schedules: SupabaseClassEventData[],
  customAccessToken?: string,
): Promise<{ total: number; synced: number; errors: string[] }> {
  let synced = 0;
  const errors: string[] = [];

  for (const schedule of schedules) {
    const res = await createGoogleCalendarClassEvent(schedule, customAccessToken);
    if (res.success) {
      synced++;
    } else if (res.error) {
      errors.push(`${schedule.disciplineName} (${schedule.turmaName}): ${res.error}`);
    }
  }

  return {
    total: schedules.length,
    synced,
    errors,
  };
}
