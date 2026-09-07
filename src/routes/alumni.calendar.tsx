import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Download, Network } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAlumniEvents } from "@/features/alumni/server";
import { toIcsCalendar } from "@/features/calendar/ics";

export const Route = createFileRoute("/alumni/calendar")({
  head: () => ({ meta: [{ title: "Calendário Alumni · SIGA" }] }),
  component: AlumniCalendarPage,
});

function AlumniCalendarPage() {
  const eventsQuery = useQuery({ queryKey: ["alumni", "calendar", "events"], queryFn: () => listAlumniEvents() });
  const events = (eventsQuery.data ?? []).filter((event) => event.status === "published");

  function downloadIcs() {
    const body = toIcsCalendar(events.map((event) => ({
      uid: `alumni-${event.id}@siga.plus`,
      title: event.title,
      description: [event.description, event.location ? `Local: ${event.location}` : null, event.online_url ? `Online: ${event.online_url}` : null].filter(Boolean).join("\n"),
      event_date: event.starts_at,
      ends_on: event.ends_at || event.starts_at,
    })), { calendarName: "SIGA · Alumni", calendarDescription: "Eventos publicados da rede Alumni" });
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
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><CalendarDays className="size-3.5" /> Calendário SIGA</div><h1 className="mt-3 text-3xl font-black tracking-tight">Agenda Alumni</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Eventos publicados da rede Alumni com exportação ICS compatível com o motor central de calendário do SIGA.</p></div>
            <div className="flex flex-wrap gap-2"><Link to="/alumni" className="inline-flex h-10 items-center rounded-xl border border-input px-4 text-sm font-medium"><Network className="mr-2 size-4" />Rede Alumni</Link><Button onClick={downloadIcs} disabled={!events.length}><Download className="mr-2 size-4" />Exportar ICS</Button></div>
          </div>
        </section>

        <Card><CardHeader><CardTitle>Eventos publicados</CardTitle></CardHeader><CardContent className="space-y-3">{eventsQuery.isLoading ? <p className="text-sm text-muted-foreground">A carregar agenda…</p> : events.length ? events.map((event) => <div key={event.id} className="grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-[160px_minmax(0,1fr)]"><div><p className="text-xs font-bold uppercase text-primary">{new Date(event.starts_at).toLocaleDateString("pt-AO")}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(event.starts_at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}</p></div><div><p className="font-bold">{event.title}</p><p className="mt-1 text-sm text-muted-foreground">{event.description || "Evento da comunidade Alumni"}</p><p className="mt-2 text-xs text-muted-foreground">{event.location || (event.online_url ? "Evento online" : "Local por definir")}</p></div></div>) : <p className="text-sm text-muted-foreground">Ainda não existem eventos Alumni publicados.</p>}</CardContent></Card>
      </div>
    </AppShell>
  );
}
