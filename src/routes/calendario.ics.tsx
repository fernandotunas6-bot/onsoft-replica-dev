import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getPublicCalendarFeed } from "@/features/calendar/feed";

// style-check: route-exempt - endpoint público de subscrição, sem shell administrativo.

export const Route = createFileRoute("/calendario/ics")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: CalendarFeedPage,
});

function toIcs(events: Array<{ title: string; description: string | null; event_date: string; ends_on: string | null }>) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIGA//Calendario//PT",
    "CALSCALE:GREGORIAN",
  ];
  for (const event of events) {
    const start = event.event_date.replaceAll("-", "");
    const end = (event.ends_on ?? event.event_date).replaceAll("-", "");
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${event.title.replaceAll(",", "\\,")}`,
      `DESCRIPTION:${String(event.description ?? "").replaceAll("\n", "\\n")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function CalendarFeedPage() {
  const { token } = Route.useSearch();
  const feedQuery = useQuery({
    queryKey: ["calendar", "public-feed", token],
    queryFn: () => getPublicCalendarFeed({ data: { token } }),
    enabled: token.length >= 16,
    retry: false,
  });
  const events = feedQuery.data ?? [];
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/calendario/ics?token=${token}`
      : token;

  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-2xl font-extrabold">Calendário móvel</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Adicione este endereço ao calendário do telemóvel ou do email. O token identifica o seu
        feed pessoal da escola.
      </p>
      <p className="mt-4 break-all rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs">
        {url}
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        {feedQuery.isError
          ? "Feed inválido ou expirado."
          : `${events.length} evento(s) disponíveis.`}
      </p>
      <button
        type="button"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        disabled={!events.length}
        onClick={() => {
          const blob = new Blob([toIcs(events)], { type: "text/calendar;charset=utf-8" });
          const href = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = href;
          link.download = "siga-calendario.ics";
          link.click();
          URL.revokeObjectURL(href);
        }}
      >
        Descarregar .ics
      </button>
    </main>
  );
}
