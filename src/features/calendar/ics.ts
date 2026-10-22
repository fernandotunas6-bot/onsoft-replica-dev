import { addDaysIso } from "./dates";

export type CalendarIcsEvent = {
  uid?: string;
  title: string;
  description?: string | null;
  event_date: string;
  ends_on: string | null;
};

export type CalendarIcsTimedEvent = {
  uid?: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
};

function icsEscape(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold at 75 UTF-8 octets without splitting a Unicode character. */
function serializeCalendar(lines: string[]) {
  const encoder = new TextEncoder();
  return `${lines
    .map((line) => {
      let folded = "";
      let octets = 0;
      for (const character of line) {
        const size = encoder.encode(character).length;
        if (octets + size > 75) {
          folded += "\r\n ";
          octets = 1;
        }
        folded += character;
        octets += size;
      }
      return folded;
    })
    .join("\r\n")}\r\n`;
}

function icsDate(value: string) {
  return value.slice(0, 10).replaceAll("-", "");
}

function icsUtcDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Data/hora inválida para ICS.");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function calendarHeader(options?: { calendarName?: string; calendarDescription?: string }) {
  const calendarName = options?.calendarName?.trim() || "Calendário lectivo SIGA";
  const calendarDescription =
    options?.calendarDescription?.trim() || "Períodos lectivos e feriados nacionais · Angola";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIGA//Calendario//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:Africa/Luanda",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    `X-WR-CALDESC:${icsEscape(calendarDescription)}`,
  ];
}

/** DTEND DATE é exclusivo — o último dia inclusivo precisa de +1. */
export function icsExclusiveEnd(inclusiveEnd: string) {
  return addDaysIso(inclusiveEnd.slice(0, 10) || inclusiveEnd, 1);
}

export function toIcsCalendar(
  events: CalendarIcsEvent[],
  options?: { calendarName?: string; calendarDescription?: string },
) {
  const lines = calendarHeader(options);
  const stamp = icsUtcDateTime(new Date().toISOString());
  for (const event of events) {
    const start = event.event_date.slice(0, 10);
    const inclusiveEnd = (event.ends_on ?? event.event_date).slice(0, 10);
    const uid = event.uid ?? `${start}-${event.title.slice(0, 40)}@siga.plus`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(icsExclusiveEnd(inclusiveEnd))}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(String(event.description ?? ""))}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return serializeCalendar(lines);
}

export function toIcsTimedCalendar(
  events: CalendarIcsTimedEvent[],
  options?: { calendarName?: string; calendarDescription?: string },
) {
  const lines = calendarHeader(options);
  const stamp = icsUtcDateTime(new Date().toISOString());
  for (const event of events) {
    const start = icsUtcDateTime(event.starts_at);
    const end = icsUtcDateTime(
      event.ends_at ?? new Date(new Date(event.starts_at).getTime() + 60 * 60 * 1000).toISOString(),
    );
    const uid = event.uid ?? `${start}-${event.title.slice(0, 40)}@siga.plus`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(String(event.description ?? ""))}`,
      ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return serializeCalendar(lines);
}

export function calendarIcsFeedUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/api/calendar/ics?token=${encodeURIComponent(token)}`;
}

export function calendarWebcalFeedUrl(origin: string, token: string) {
  return calendarIcsFeedUrl(origin, token)
    .replace(/^https:/, "webcal:")
    .replace(/^http:/, "webcal:");
}

export function calendarIcsResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=siga-calendario.ics",
      "Cache-Control": "no-store",
    },
  });
}
