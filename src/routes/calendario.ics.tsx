import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getPublicCalendarFeed } from "@/features/calendar/feed";
import { calendarIcsFeedUrl, toIcsCalendar } from "@/features/calendar/ics";
import { servePublicCalendarIcs } from "@/features/calendar/ics-serve";

// style-check: route-exempt - endpoint público de subscrição, sem shell administrativo.

export const Route = createFileRoute("/calendario/ics")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (token.length < 16) {
          return new Response(
            `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Calendário móvel · SIGA</title><body style="font-family:sans-serif;max-width:40rem;margin:3rem auto;padding:0 1.25rem;line-height:1.5"><h1>Calendário móvel</h1><p>Abra o SIGA em <a href="/calendario">/calendario</a> e use <strong>Subscrever ICS</strong> para obter o endereço do feed.</p></body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
        return servePublicCalendarIcs(request);
      },
    },
  },
  component: CalendarFeedPage,
});

function CalendarFeedPage() {
  const { token } = Route.useSearch();
  const feedQuery = useQuery({
    queryKey: ["calendar", "public-feed", token],
    queryFn: () => getPublicCalendarFeed({ data: { token } }),
    enabled: token.length >= 16,
    retry: false,
  });
  const feed = feedQuery.data;
  const events = feed?.events ?? [];
  // A origem vem por estado, não lida durante o render.
  //
  // Estava `typeof window !== "undefined" ? calendarIcsFeedUrl(origin, token) : token`, e
  // `url` vai para o JSX: o servidor renderizava o token cru e o cliente o endereço
  // completo. Texto diferente dos dois lados é desencontro de hidratação — a mesma falha
  // que o `DesktopTitleBar` tinha. Assim, ambos começam no token e o endereço aparece
  // assim que montar.
  const [origem, setOrigem] = useState("");
  useEffect(() => setOrigem(window.location.origin), []);
  const url = origem ? calendarIcsFeedUrl(origem, token) : token;

  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-2xl font-extrabold">Calendário móvel</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Adicione este endereço ao calendário do telemóvel ou do email. O token identifica o seu feed
        pessoal da escola.
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
          const blob = new Blob([toIcsCalendar(events, { calendarName: feed?.calendarName })], {
            type: "text/calendar;charset=utf-8",
          });
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
