import { loadPublicCalendarFeed, getPublicCalendarFeedInputSchema } from "./feed";
import { calendarIcsResponse, toIcsCalendar } from "./ics";

export async function servePublicCalendarIcs(request: Request) {
  const url = new URL(request.url);
  const parsed = getPublicCalendarFeedInputSchema.safeParse({
    token: url.searchParams.get("token") ?? "",
  });
  if (!parsed.success) {
    return new Response("Feed de calendário inválido.", { status: 400 });
  }
  try {
    const events = await loadPublicCalendarFeed(parsed.data.token);
    return calendarIcsResponse(toIcsCalendar(events.events, { calendarName: events.calendarName }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed de calendário inválido.";
    return new Response(message, { status: 404 });
  }
}
