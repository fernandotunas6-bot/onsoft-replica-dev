/**
 * Google Calendar API Service for SIGA
 * Synchronizes class schedules, exams, and school events directly with Google Calendar.
 */

import { getStoredGoogleOAuthToken } from "./oauth";

export interface ClassScheduleData {
  id?: string;
  turmaName: string;
  subjectName: string;
  teacherName?: string;
  roomName?: string;
  dayOfWeek?: number; // 1 = Monday, 5 = Friday
  startTime: string; // HH:mm format, e.g. "08:00"
  endTime: string; // HH:mm format, e.g. "09:30"
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  description?: string;
  attendeeEmails?: string[];
}

export interface GoogleCalendarEventResponse {
  id: string;
  htmlLink: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Creates a Google Calendar event from Supabase class schedule data.
 */
export async function createCalendarEventFromClassSchedule(
  schedule: ClassScheduleData,
  customAccessToken?: string,
): Promise<{ success: boolean; event?: GoogleCalendarEventResponse; error?: string }> {
  const token = customAccessToken || getStoredGoogleOAuthToken()?.access_token;
  if (!token) {
    return {
      success: false,
      error: "Google Workspace não está autenticado. Conecte sua conta Google nas configurações.",
    };
  }

  // Calculate start & end ISO date times
  const today = new Date();
  const dateStr = schedule.startDate || today.toISOString().split("T")[0];
  const startDateTime = `${dateStr}T${schedule.startTime}:00`;
  const endDateTime = `${dateStr}T${schedule.endTime}:00`;

  // Construct Google Calendar Event Resource
  const eventPayload: Record<string, unknown> = {
    summary: `[SIGA] ${schedule.subjectName} - Turma ${schedule.turmaName}`,
    location: schedule.roomName ? `Sala: ${schedule.roomName}` : undefined,
    description: [
      `Aula da disciplina ${schedule.subjectName}`,
      schedule.teacherName ? `Docente: ${schedule.teacherName}` : null,
      schedule.description ? `Notas: ${schedule.description}` : null,
      `Origem: Sistema Integrado de Gestão Académica (SIGA)`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      dateTime: new Date(startDateTime).toISOString(),
      timeZone: "Africa/Luanda",
    },
    end: {
      dateTime: new Date(endDateTime).toISOString(),
      timeZone: "Africa/Luanda",
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 15 },
        { method: "email", minutes: 60 },
      ],
    },
  };

  if (schedule.attendeeEmails && schedule.attendeeEmails.length > 0) {
    eventPayload["attendees"] = schedule.attendeeEmails.map((email) => ({ email }));
  }

  // If weekly recurring schedule
  if (schedule.endDate) {
    const daysMap = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const dayCode = schedule.dayOfWeek !== undefined ? daysMap[schedule.dayOfWeek] : undefined;
    const untilDateFormatted = schedule.endDate.replace(/-/g, "") + "T235959Z";

    if (dayCode) {
      eventPayload["recurrence"] = [`RRULE:FREQ=WEEKLY;BYDAY=${dayCode};UNTIL=${untilDateFormatted}`];
    }
  }

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `Falha na Google Calendar API (${response.status}): ${errorBody}`,
      };
    }

    const createdEvent: GoogleCalendarEventResponse = await response.json();
    return {
      success: true,
      event: createdEvent,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Erro inesperado ao conectar à Google Calendar API",
    };
  }
}

/**
 * Lists upcoming events from the primary Google Calendar.
 */
export async function listGoogleCalendarEvents(
  timeMin?: string,
  maxResults = 20,
  customAccessToken?: string,
): Promise<{ success: boolean; items?: GoogleCalendarEventResponse[]; error?: string }> {
  const token = customAccessToken || getStoredGoogleOAuthToken()?.access_token;
  if (!token) {
    return { success: false, error: "Google Calendar não autenticado." };
  }

  const query = new URLSearchParams({
    timeMin: timeMin || new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });

  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return { success: false, error: `Erro HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, items: data.items || [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao listar eventos" };
  }
}

/**
 * Deletes a calendar event by ID.
 */
export async function deleteGoogleCalendarEvent(
  eventId: string,
  customAccessToken?: string,
): Promise<{ success: boolean; error?: string }> {
  const token = customAccessToken || getStoredGoogleOAuthToken()?.access_token;
  if (!token) {
    return { success: false, error: "Google Calendar não autenticado." };
  }

  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      return { success: false, error: `Erro HTTP ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao apagar evento" };
  }
}
