import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  GraduationCap,
  Handshake,
  History,
  Mail,
  MapPin,
  Network,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MediaAvatar } from "@/components/ui/media-frame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAlumniProfile, verifyAlumniProfile } from "@/features/alumni/server";

export const Route = createFileRoute("/alumni/$alumniId")({
  head: () => ({ meta: [{ title: "Ficha Alumni 360º · SIGA" }] }),
  component: AlumniProfilePage,
});

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-3 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[65%] text-right text-sm font-medium text-foreground">
        {value || "—"}
      </span>
    </div>
  );
}

function AlumniProfilePage() {
  const { alumniId } = Route.useParams();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["alumni", "profile", alumniId],
    queryFn: () => getAlumniProfile({ data: { alumniId } }),
  });
  const verifyMutation = useMutation({
    mutationFn: () => verifyAlumniProfile({ data: { alumniId } }),
    onSuccess: async () => {
      toast.success("Perfil Alumni verificado.");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "profile", alumniId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível verificar o perfil."),
  });

  if (profileQuery.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-6 text-sm text-muted-foreground">
          A carregar ficha Alumni 360º…
        </div>
      </AppShell>
    );
  }
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-6">
          <Card>
            <CardContent className="p-8 text-sm text-destructive">
              Não foi possível carregar este Alumni.
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const data = profileQuery.data;
  const profile = data.profile as Record<string, any>;
  const person = (data.person ?? {}) as Record<string, any>;
  const student = (data.student ?? {}) as Record<string, any>;
  const experiences = data.experiences as Array<Record<string, any>>;
  const engagements = data.engagements as Array<Record<string, any>>;
  const mentorships = data.mentorships as Array<Record<string, any>>;
  const applications = data.applications as Array<Record<string, any>>;
  const eventRegistrations = data.eventRegistrations as Array<Record<string, any>>;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" asChild className="rounded-xl">
            <Link to="/alumni">
              <ArrowLeft className="mr-2 size-4" />
              Voltar à rede Alumni
            </Link>
          </Button>
          {!profile.verified_at ? (
            <Button
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className="rounded-xl"
            >
              <ShieldCheck className="mr-2 size-4" />
              Verificar identidade
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-xs font-bold text-success">
              <BadgeCheck className="size-4" />
              Identidade verificada
            </span>
          )}
        </div>

        <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-sm">
          <div className="relative bg-gradient-to-br from-primary/15 via-background to-success/10 p-6 md:p-8">
            <div className="absolute right-8 top-6 opacity-10">
              <Network className="size-28" />
            </div>
            <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
              <MediaAvatar
                src={person.photo_url ?? null}
                alt={person.full_name ?? "Alumni"}
                className="size-24 rounded-[26px] object-cover ring-4 ring-background"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                    {person.full_name ?? "Alumni"}
                  </h1>
                  {profile.verified_at ? <ShieldCheck className="size-5 text-primary" /> : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {profile.headline || profile.current_role || "Trajectória Alumni"}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="size-3.5" />
                    {student.student_number || "Sem processo"}
                    {profile.graduation_year ? ` · Turma ${profile.graduation_year}` : ""}
                  </span>
                  {profile.current_company ? (
                    <span className="inline-flex items-center gap-1.5">
                      <BriefcaseBusiness className="size-3.5" />
                      {profile.current_company}
                    </span>
                  ) : null}
                  {profile.city || profile.province || profile.country ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      {[profile.city, profile.province, profile.country]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="min-w-40 rounded-2xl border border-border/60 bg-background/80 p-4 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Perfil completo
                </p>
                <p className="mt-1 text-3xl font-black">{profile.profile_completion ?? 0}%</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${profile.profile_completion ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserRound className="size-4 text-primary" />
                  Identidade e contacto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="E-mail" value={person.email} />
                <InfoRow label="Telefone" value={person.phone} />
                <InfoRow label="Estado" value={profile.employment_status} />
                <InfoRow label="Área" value={profile.industry} />
                <InfoRow label="Curso" value={profile.graduation_course} />
                <InfoRow label="Conclusão" value={profile.graduation_year} />
                <InfoRow label="Visibilidade" value={profile.directory_visibility} />
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  Rede
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                  <span>Mentor</span>
                  <strong>{profile.available_for_mentoring ? "Sim" : "Não"}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                  <span>Procura mentor</span>
                  <strong>{profile.seeking_mentor ? "Sim" : "Não"}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                  <span>Oportunidades</span>
                  <strong>{profile.open_to_opportunities ? "Aberto" : "Fechado"}</strong>
                </div>
              </CardContent>
            </Card>
          </aside>

          <Tabs defaultValue="journey" className="space-y-4">
            <TabsList className="h-auto flex-wrap rounded-2xl bg-muted/60 p-1">
              <TabsTrigger value="journey" className="rounded-xl">
                Percurso
              </TabsTrigger>
              <TabsTrigger value="academic" className="rounded-xl">
                Académico
              </TabsTrigger>
              <TabsTrigger value="mentoring" className="rounded-xl">
                Mentoria
              </TabsTrigger>
              <TabsTrigger value="opportunities" className="rounded-xl">
                Oportunidades
              </TabsTrigger>
              <TabsTrigger value="events" className="rounded-xl">
                Eventos
              </TabsTrigger>
              <TabsTrigger value="engagement" className="rounded-xl">
                Relacionamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="journey">
              <Card>
                <CardHeader>
                  <CardTitle>Experiências e trajectória</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {experiences.length ? (
                    experiences.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{item.title || item.kind}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.organization}
                              {item.location ? ` · ${item.location}` : ""}
                            </p>
                          </div>
                          {item.is_current ? (
                            <span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
                              Actual
                            </span>
                          ) : null}
                        </div>
                        {item.description ? (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ainda não há experiências profissionais ou académicas registadas.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="academic">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico académico preservado</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.enrollments.length ? (
                    data.enrollments.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-sm"
                      >
                        <span>Matrícula {item.id.slice(0, 8)}</span>
                        <span className="font-semibold">{item.status}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sem matrículas históricas localizadas.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mentoring">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Handshake className="size-5 text-primary" />
                    Mentorias
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mentorships.length ? (
                    mentorships.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/70 p-4">
                        <p className="font-semibold">{item.focus_area}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Estado: {item.status}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma relação de mentoria formal registada.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="opportunities">
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline de oportunidades</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {applications.length ? (
                    applications.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/70 p-4">
                        <p className="font-semibold">
                          {item.alumni_opportunities?.title ?? "Oportunidade"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.alumni_opportunities?.organization ?? ""} · {item.status}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sem candidaturas ou interesses registados.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="events">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="size-5 text-primary" />
                    Participação em eventos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {eventRegistrations.length ? (
                    eventRegistrations.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/70 p-4">
                        <p className="font-semibold">
                          {item.alumni_events?.title ?? "Evento Alumni"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.status}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem inscrições em eventos.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="engagement">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="size-5 text-primary" />
                    Linha de relacionamento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {engagements.length ? (
                    engagements.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold">{item.title}</p>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.occurred_at).toLocaleDateString("pt-PT")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary">
                          {item.kind}
                        </p>
                        {item.notes ? (
                          <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ainda não existem interações registadas.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}
