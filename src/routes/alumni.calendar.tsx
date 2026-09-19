import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Download, Network } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAlumniEvents } from "@/features/alumni/server";
import { toIcsTimedCalendar } from "@/features/calendar/ics";

export const Route = createFileRoute("/alumni/calendar")({
  head: () => ({ meta: [{ title: "Calendário Alumni · SIGA" }] }),
  component: AlumniCalendarPage,
});

function AlumniCalendarPage() {
  const eventsQuery = useQuery({
    queryKey: ["alumni", "calendar", "events"],
    queryFn: () => listAlumniEvents(),
  });
  const events = (eventsQuery.data ?? []).filter((event) => event.status === "published");

  function downloadIcs() {
    const body = toIcsTimedCalendar(
      events.map((event) => ({
        uid: `alumni-${event.id}@siga.plus`,
        title: event.title,
        description: [event.description, event.online_url ? `Online: ${event.online_url}` : null]
          .filter(Boolean)
          .join("\n"),
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        location: event.location,
      })),
      { calendarName: "SIGA · Alumni", calendarDescription: "Eventos publicados da rede Alumni" },
    );
    const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "siga-alumni.ics";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          group="Comunidade & Eventos"
          title="Agenda Alumni"
          description="Eventos publicados da rede Alumni com data, hora e local preservados na exportação ICS do motor central do SIGA."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link
                to="/alumni"
                className="inline-flex h-9 items-center rounded-xl border border-input px-3.5 text-xs font-medium hover:bg-accent"
              >
                <Network className="mr-2 size-3.5" />
                Rede Alumni
              </Link>
              <Button size="sm" onClick={downloadIcs} disabled={!events.length} className="rounded-xl text-xs h-9">
                <Download className="mr-2 size-3.5" />
                Exportar ICS
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Eventos publicados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {eventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar agenda…</p>
            ) : events.length ? (
              events.map((event) => (
                <div
                  key={event.id}
                  className="grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-[160px_minmax(0,1fr)]"
                >
                  <div>
                    <p className="text-xs font-bold uppercase text-primary">
                      {new Date(event.starts_at).toLocaleDateString("pt-AO")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(event.starts_at).toLocaleTimeString("pt-AO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold">{event.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {event.description || "Evento da comunidade Alumni"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {event.location || (event.online_url ? "Evento online" : "Local por definir")}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Ainda não existem eventos Alumni publicados.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
