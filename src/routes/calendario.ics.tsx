import { createFileRoute } from "@tanstack/react-router";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

// style-check: route-exempt - endpoint público de subscrição, sem shell administrativo.

function toIcs(
  events: Array<{
    title: string;
    description: string | null;
    event_date: string;
    ends_on: string | null;
  }>,
) {
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

/**
 * Rota de servidor pura — sem isto, o "endereço de subscrição" copiado nos
 * botões Subscrever/Google/Apple devolvia a shell HTML/JS da app em vez de
 * bytes ICS crus, e nenhum cliente de calendário real (Google/Apple/Outlook)
 * consegue subscrever uma URL que não devolve text/calendar directamente.
 */
export const Route = createFileRoute("/calendario/ics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (token.trim().length < 16) {
          return new Response("Feed de calendário inválido.", { status: 400 });
        }
        const db = await loadSgaAdminClient();
        const { data: feed, error } = await db
          .from("calendar_feed_tokens")
          .select("school_id")
          .eq("token", token)
          .maybeSingle();
        if (error || !feed) {
          return new Response("Feed de calendário inválido.", { status: 404 });
        }
        const { data: terms } = await db
          .from("terms")
          .select("name, starts_on, ends_on, sequence")
          .eq("school_id", feed.school_id)
          .order("starts_on")
          .limit(80);
        const events = (terms ?? []).map((term) => ({
          title: String(term.name ?? "Período lectivo"),
          description: `Período lectivo ${term.sequence ?? ""}`.trim(),
          event_date: String(term.starts_on ?? ""),
          ends_on: term.ends_on ? String(term.ends_on) : null,
        }));
        return new Response(toIcs(events), {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'attachment; filename="siga-calendario.ics"',
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
