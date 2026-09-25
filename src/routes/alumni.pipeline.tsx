import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarCheck2,
  Handshake,
  Network,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAlumni } from "@/features/alumni/server";
import {
  createMentorshipFromPipeline,
  listEventRegistrationPipeline,
  listMentorshipPipeline,
  listOpportunityApplicationPipeline,
  updateEventRegistrationStatus,
  updateMentorshipPipelineStatus,
  updateOpportunityApplicationStatus,
} from "@/features/alumni/pipeline";

export const Route = createFileRoute("/alumni/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline Alumni · SIGA" }] }),
  component: AlumniPipelinePage,
});

const applicationStatuses = [
  "interested",
  "applied",
  "shortlisted",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
const eventStatuses = ["registered", "waitlist", "attended", "cancelled"] as const;
const mentorshipStatuses = ["requested", "active", "completed", "cancelled"] as const;

const statusLabel: Record<string, string> = {
  interested: "Interessado",
  applied: "Candidatou-se",
  shortlisted: "Pré-seleccionado",
  accepted: "Aceite",
  rejected: "Não seleccionado",
  withdrawn: "Retirado",
  registered: "Inscrito",
  waitlist: "Lista de espera",
  attended: "Presente",
  cancelled: "Cancelado",
  requested: "Solicitada",
  active: "Activa",
  completed: "Concluída",
};

function AlumniPipelinePage() {
  const queryClient = useQueryClient();
  const [mentorId, setMentorId] = useState("");
  const [menteeId, setMenteeId] = useState("");
  const [focusArea, setFocusArea] = useState("");

  const applicationsQuery = useQuery({
    queryKey: ["alumni", "pipeline", "applications"],
    queryFn: () => listOpportunityApplicationPipeline({ data: { limit: 250 } }),
  });
  const registrationsQuery = useQuery({
    queryKey: ["alumni", "pipeline", "registrations"],
    queryFn: () => listEventRegistrationPipeline({ data: { limit: 250 } }),
  });
  const mentorshipsQuery = useQuery({
    queryKey: ["alumni", "pipeline", "mentorships"],
    queryFn: () => listMentorshipPipeline({ data: { limit: 250 } }),
  });
  const alumniQuery = useQuery({
    queryKey: ["alumni", "pipeline", "people"],
    queryFn: () => listAlumni({ data: { limit: 200, offset: 0 } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["alumni", "pipeline"] });

  const applicationMutation = useMutation({
    mutationFn: (payload: {
      opportunityId: string;
      alumniId: string;
      status: (typeof applicationStatuses)[number];
    }) => updateOpportunityApplicationStatus({ data: payload }),
    onSuccess: async () => {
      toast.success("Estado da candidatura actualizado.");
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao actualizar candidatura."),
  });

  const registrationMutation = useMutation({
    mutationFn: (payload: {
      eventId: string;
      alumniId: string;
      status: (typeof eventStatuses)[number];
    }) => updateEventRegistrationStatus({ data: payload }),
    onSuccess: async () => {
      toast.success("Presença/inscrição actualizada.");
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao actualizar evento."),
  });

  const mentorshipStatusMutation = useMutation({
    mutationFn: (payload: { mentorshipId: string; status: (typeof mentorshipStatuses)[number] }) =>
      updateMentorshipPipelineStatus({ data: payload }),
    onSuccess: async () => {
      toast.success("Mentoria actualizada.");
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao actualizar mentoria."),
  });

  const createMentorshipMutation = useMutation({
    mutationFn: () =>
      createMentorshipFromPipeline({
        data: { mentorAlumniId: mentorId, menteeAlumniId: menteeId, focusArea },
      }),
    onSuccess: async () => {
      toast.success("Mentoria criada.");
      setMenteeId("");
      setFocusArea("");
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao criar mentoria."),
  });

  const applications = applicationsQuery.data ?? [];
  const registrations = registrationsQuery.data ?? [];
  const mentorships = mentorshipsQuery.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          group="Alumni"
          title="Pipeline Alumni"
          description="Gestão integrada de candidaturas, presenças em eventos e relações de mentoria da rede pós-formação."
          icon={UserRoundCheck}
          crumbs={[
            { label: "Início", to: "/" },
            { label: "Alumni", to: "/alumni" },
            { label: "Pipeline" },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild className="rounded-xl h-9 text-xs">
                <Link to="/alumni">
                  <Network className="mr-1.5 size-3.5" />
                  Rede
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="rounded-xl h-9 text-xs">
                <Link to="/alumni/operations">Centro Operacional</Link>
              </Button>
            </div>
          }
        />

        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <BriefcaseBusiness className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">{applications.length}</p>
              <p className="text-xs text-muted-foreground">Candidaturas/interesses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <CalendarCheck2 className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">{registrations.length}</p>
              <p className="text-xs text-muted-foreground">Inscrições em eventos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Handshake className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">{mentorships.length}</p>
              <p className="text-xs text-muted-foreground">Relações de mentoria</p>
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="applications" className="space-y-4">
          <TabsList className="h-auto flex-wrap rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="applications" className="rounded-xl">
              Candidaturas
            </TabsTrigger>
            <TabsTrigger value="events" className="rounded-xl">
              Eventos & Presenças
            </TabsTrigger>
            <TabsTrigger value="mentoring" className="rounded-xl">
              Mentorias
            </TabsTrigger>
          </TabsList>

          <TabsContent value="applications">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline de oportunidades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {applications.length ? (
                  applications.map((row) => {
                    const opp = Array.isArray(row.alumni_opportunities)
                      ? row.alumni_opportunities[0]
                      : row.alumni_opportunities;
                    return (
                      <div
                        key={row.id}
                        className="grid gap-3 rounded-2xl border border-border/60 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_220px] lg:items-center"
                      >
                        <div>
                          <p className="font-bold">{row.alumni.fullName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.alumni.studentNumber || "Sem nº de processo"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{opp?.title || "Oportunidade"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {opp?.organization || opp?.opportunity_type || "Rede Alumni"}
                          </p>
                        </div>
                        <select
                          id={`opp-status-${row.opportunity_id}-${row.alumni_id}`}
                          aria-label="Estado da candidatura"
                          value={row.status}
                          onChange={(e) =>
                            applicationMutation.mutate({
                              opportunityId: row.opportunity_id,
                              alumniId: row.alumni_id,
                              status: e.target.value as (typeof applicationStatuses)[number],
                            })
                          }
                          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                        >
                          {applicationStatuses.map((status) => (
                            <option key={status} value={status}>
                              {statusLabel[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem candidaturas registadas nesta selecção.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>Inscrições e check-in</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {registrations.length ? (
                  registrations.map((row) => {
                    const event = Array.isArray(row.alumni_events)
                      ? row.alumni_events[0]
                      : row.alumni_events;
                    return (
                      <div
                        key={row.id}
                        className="grid gap-3 rounded-2xl border border-border/60 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_220px] lg:items-center"
                      >
                        <div>
                          <p className="font-bold">{row.alumni.fullName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.checked_in_at
                              ? `Check-in: ${new Date(row.checked_in_at).toLocaleString("pt-AO")}`
                              : "Sem check-in"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{event?.title || "Evento Alumni"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {event?.starts_at
                              ? new Date(event.starts_at).toLocaleString("pt-AO")
                              : "Data por confirmar"}
                          </p>
                        </div>
                        <select
                          id={`event-status-${row.event_id}-${row.alumni_id}`}
                          aria-label="Estado da inscrição"
                          value={row.status}
                          onChange={(e) =>
                            registrationMutation.mutate({
                              eventId: row.event_id,
                              alumniId: row.alumni_id,
                              status: e.target.value as (typeof eventStatuses)[number],
                            })
                          }
                          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                        >
                          {eventStatuses.map((status) => (
                            <option key={status} value={status}>
                              {statusLabel[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ainda não existem inscrições em eventos.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mentoring" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Criar relação de mentoria</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <select
                  id="mentoring-mentor"
                  aria-label="Seleccionar mentor"
                  value={mentorId}
                  onChange={(e) => setMentorId(e.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">Seleccionar mentor…</option>
                  {(alumniQuery.data ?? [])
                    .filter((row) => row.available_for_mentoring)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.full_name} · {row.student_number}
                      </option>
                    ))}
                </select>
                <select
                  id="mentoring-mentee"
                  aria-label="Seleccionar mentorado"
                  value={menteeId}
                  onChange={(e) => setMenteeId(e.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">Seleccionar mentorado…</option>
                  {(alumniQuery.data ?? [])
                    .filter((row) => row.id !== mentorId)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.full_name} · {row.student_number}
                      </option>
                    ))}
                </select>
                <Input
                  id="mentoring-focus-area"
                  aria-label="Área de foco"
                  value={focusArea}
                  onChange={(e) => setFocusArea(e.target.value)}
                  placeholder="Área de foco: carreira, liderança, tecnologia…"
                  className="md:col-span-2"
                />
                <div className="md:col-span-2">
                  <Button
                    onClick={() => createMentorshipMutation.mutate()}
                    disabled={
                      !mentorId ||
                      !menteeId ||
                      focusArea.trim().length < 2 ||
                      createMentorshipMutation.isPending
                    }
                  >
                    <Handshake className="mr-2 size-4" />
                    Criar mentoria
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mentorias existentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mentorships.length ? (
                  mentorships.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-3 rounded-2xl border border-border/60 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_200px] lg:items-center"
                    >
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground">Mentor</p>
                        <p className="font-bold">{row.mentor.fullName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground">Mentorado</p>
                        <p className="font-bold">{row.mentee.fullName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground">Foco</p>
                        <p className="text-sm font-semibold">{row.focus_area}</p>
                      </div>
                      <select
                        id={`mentorship-status-${row.id}`}
                        aria-label="Estado da mentoria"
                        value={row.status}
                        onChange={(e) =>
                          mentorshipStatusMutation.mutate({
                            mentorshipId: row.id,
                            status: e.target.value as (typeof mentorshipStatuses)[number],
                          })
                        }
                        className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      >
                        {mentorshipStatuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ainda não existem mentorias registadas.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
