import { createFileRoute } from "@tanstack/react-router";
import { servePublicCalendarIcs } from "@/features/calendar/ics-serve";

// style-check: route-exempt — feed ICS público para Google/Apple Calendar.

export const Route = createFileRoute("/api/calendar/ics")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  server: {
    handlers: {
      GET: async ({ request }) => servePublicCalendarIcs(request),
    },
  },
  component: CalendarIcsApiPlaceholder,
});

function CalendarIcsApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">Feed ICS</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET devolve o calendário lectivo em <span className="font-mono text-xs">text/calendar</span>
        .
      </p>
    </main>
  );
}
