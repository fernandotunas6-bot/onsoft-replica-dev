import { addDaysIso } from "./dates";

export type CalendarIcsEvent = {
  uid?: string;
  title: string;
  description?: string | null;
  event_date: string;
  ends_on: string | null;
};

function icsEscape(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function icsDate(value: string) {
  return value.slice(0, 10).replaceAll("-", "");
}

/** DTEND DATE é exclusivo — o último dia inclusivo precisa de +1. */
export function icsExclusiveEnd(inclusiveEnd: string) {
  return addDaysIso(inclusiveEnd.slice(0, 10) || inclusiveEnd, 1);
}

export function toIcsCalendar(
  events: CalendarIcsEvent[],
  options?: { calendarName?: string; calendarDescription?: string },
) {
  const calendarName = options?.calendarName?.trim() || "Calendário lectivo SIGA";
  const calendarDescription =
    options?.calendarDescription?.trim() || "Períodos lectivos e feriados nacionais · Angola";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIGA//Calendario//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:Africa/Luanda",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    `X-WR-CALDESC:${icsEscape(calendarDescription)}`,
  ];
  for (const event of events) {
    const start = event.event_date.slice(0, 10);
    const inclusiveEnd = (event.ends_on ?? event.event_date).slice(0, 10);
    const uid = event.uid ?? `${start}-${icsEscape(event.title).slice(0, 40)}@siga.plus`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(icsExclusiveEnd(inclusiveEnd))}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(String(event.description ?? ""))}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
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
