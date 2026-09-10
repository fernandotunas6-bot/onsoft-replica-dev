import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleUserRound,
  ExternalLink,
  GraduationCap,
  Handshake,
  HeartHandshake,
  MapPin,
  MapPinned,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MediaAvatar } from "@/components/ui/media-frame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  bootstrapGraduatedStudents,
  getAlumniOverview,
  listAlumni,
  listAlumniEvents,
  listAlumniOpportunities,
} from "@/features/alumni/server";

export const Route = createFileRoute("/alumni")({
  head: () => ({
    meta: [
      { title: "Alumni · SIGA" },
      {
        name: "description",
        content:
          "Rede master de antigos alunos: empregabilidade, mentoria, oportunidades, eventos, trajectórias e impacto institucional.",
      },
    ],
  }),
  component: AlumniPage,
});

const employmentLabels: Record<string, string> = {
  employed: "Empregado",
  self_employed: "Empreendedor",
  student: "Em formação",
  seeking: "À procura",
  unavailable: "Indisponível",
  unknown: "Por actualizar",
};

const opportunityLabels: Record<string, string> = {
  job: "Emprego",
  internship: "Estágio",
  scholarship: "Bolsa",
  mentoring: "Mentoria",
  business: "Negócio",
  volunteer: "Voluntariado",
  event: "Evento",
  other: "Outra",
};

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ElementType;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function AlumniPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [employment, setEmployment] = useState("all");
  const [mentoringOnly, setMentoringOnly] = useState(false);
  const [opportunitiesOnly, setOpportunitiesOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["alumni", "overview"],
    queryFn: () => getAlumniOverview(),
  });
  const alumniQuery = useQuery({
    queryKey: [
      "alumni",
      "directory",
      query,
      employment,
      mentoringOnly,
      opportunitiesOnly,
      verifiedOnly,
    ],
    queryFn: () =>
      listAlumni({
        data: {
          query,
          employmentStatus: employment === "all" ? undefined : (employment as any),
          mentoringOnly,
          opportunitiesOnly,
          verifiedOnly,
          limit: 150,
          offset: 0,
        },
      }),
  });
  const opportunitiesQuery = useQuery({
    queryKey: ["alumni", "opportunities"],
    queryFn: () => listAlumniOpportunities({ data: { status: "published", limit: 100 } }),
  });
  const eventsQuery = useQuery({
    queryKey: ["alumni", "events"],
    queryFn: () => listAlumniEvents(),
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => bootstrapGraduatedStudents(),
    onSuccess: async (result) => {
      toast.success(
        result.created
          ? `${result.created} antigo(s) aluno(s) activado(s) na rede Alumni.`
          : "Todos os alunos concluídos já estão sincronizados.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alumni", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["alumni", "directory"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar Alumni."),
  });

  const overview = overviewQuery.data;
  const alumni = alumniQuery.data ?? [];
  const opportunities = opportunitiesQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const upcomingEvents = events.filter(
    (event: any) =>
      event.status === "published" && new Date(event.starts_at).getTime() >= Date.now(),
  );
  const topCohorts = useMemo(() => {
    const counts = new Map<number, number>();
    alumni.forEach((row) => {
      if (row.graduation_year)
        counts.set(row.graduation_year, (counts.get(row.graduation_year) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [alumni]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card p-6 shadow-sm md:p-8">
          <div className="absolute -right-16 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
                <Sparkles className="size-3.5" /> Alumni Intelligence Network
              </div>
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
                Alumni
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Acompanhe antigos alunos depois da conclusão: carreira, empregabilidade, mentoria,
                oportunidades, eventos, contribuição social e impacto da instituição.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/alumni/insights"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <MapPinned className="mr-2 size-4" />
                Insights & Operações
              </Link>
              <Button
                variant="outline"
                onClick={() => bootstrapMutation.mutate()}
                disabled={bootstrapMutation.isPending}
                className="rounded-xl"
              >
                <GraduationCap className="mr-2 size-4" />
                {bootstrapMutation.isPending ? "A sincronizar…" : "Sincronizar concluídos"}
              </Button>
              <Button className="rounded-xl" onClick={() => setMentoringOnly((value) => !value)}>
                <Handshake className="mr-2 size-4" />
                {mentoringOnly ? "Ver toda a rede" : "Encontrar mentores"}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Rede Alumni"
            value={overview?.total ?? "—"}
            helper="Perfis pós-formação activos"
            icon={Network}
          />
          <MetricCard
            label="Empregabilidade"
            value={overview ? `${overview.employmentRate}%` : "—"}
            helper={`${overview?.employed ?? 0} empregados/empreendedores`}
            icon={TrendingUp}
          />
          <MetricCard
            label="Mentorias activas"
            value={overview?.activeMentorships ?? "—"}
            helper={`${overview?.mentors ?? 0} mentores disponíveis`}
            icon={Handshake}
          />
          <MetricCard
            label="Oportunidades"
            value={overview?.opportunities ?? "—"}
            helper={`${overview?.upcomingEvents ?? 0} eventos futuros`}
            icon={BriefcaseBusiness}
          />
        </section>

        <Tabs defaultValue="directory" className="space-y-4">
          <TabsList className="h-auto flex-wrap rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="directory" className="rounded-xl">
              Directório
            </TabsTrigger>
            <TabsTrigger value="career" className="rounded-xl">
              Carreira & Talento
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="rounded-xl">
              Oportunidades
            </TabsTrigger>
            <TabsTrigger value="mentoring" className="rounded-xl">
              Mentoria
            </TabsTrigger>
            <TabsTrigger value="events" className="rounded-xl">
              Eventos
            </TabsTrigger>
            <TabsTrigger value="impact" className="rounded-xl">
              Impacto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="space-y-4">
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-4 md:p-5">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_auto_auto_auto]">
                  <label className="relative block">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Nome, processo, empresa, função, área, curso ou localização…"
                      className="h-10 rounded-xl pl-9"
                    />
                  </label>
                  <select
                    value={employment}
                    onChange={(event) => setEmployment(event.target.value)}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">Todos os estados profissionais</option>
                    {Object.entries(employmentLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant={mentoringOnly ? "default" : "outline"}
                    onClick={() => setMentoringOnly((value) => !value)}
                    className="rounded-xl"
                  >
                    <Handshake className="mr-2 size-4" />
                    Mentores
                  </Button>
                  <Button
                    variant={opportunitiesOnly ? "default" : "outline"}
                    onClick={() => setOpportunitiesOnly((value) => !value)}
                    className="rounded-xl"
                  >
                    <BriefcaseBusiness className="mr-2 size-4" />
                    Talento
                  </Button>
                  <Button
                    variant={verifiedOnly ? "default" : "outline"}
                    onClick={() => setVerifiedOnly((value) => !value)}
                    className="rounded-xl"
                  >
                    <ShieldCheck className="mr-2 size-4" />
                    Verificados
                  </Button>
                </div>
              </CardContent>
            </Card>

            {alumniQuery.isLoading ? (
              <Card>
                <CardContent className="p-8 text-sm text-muted-foreground">
                  A carregar a rede Alumni…
                </CardContent>
              </Card>
            ) : alumni.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <CircleUserRound className="size-10 text-muted-foreground" />
                  <h2 className="mt-4 text-lg font-bold">Ainda não há Alumni neste filtro</h2>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    Sincronize os alunos com estado “Concluído” ou altere os filtros. O perfil
                    Alumni mantém ligação ao registo académico original.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {alumni.map((row) => (
                  <Link
                    key={row.id}
                    to="/alumni/$alumniId"
                    params={{ alumniId: row.id }}
                    className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <Card className="group h-full border-border/70 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <MediaAvatar
                            src={row.photo_url}
                            alt={row.full_name}
                            className="size-12 rounded-2xl object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h3 className="truncate font-bold text-foreground">
                                {row.full_name}
                              </h3>
                              {row.verified_at ? (
                                <ShieldCheck className="size-4 shrink-0 text-primary" />
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {row.student_number}
                            </p>
                          </div>
                          <ExternalLink className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div className="mt-4 min-h-12">
                          <p className="text-sm font-semibold text-foreground">
                            {row.current_role || row.headline || "Trajectória por actualizar"}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Building2 className="size-3.5" />{" "}
                            {row.current_company ||
                              employmentLabels[row.employment_status] ||
                              "Sem organização"}
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
                          {row.graduation_year ? (
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                              Turma {row.graduation_year}
                            </span>
                          ) : null}
                          {row.available_for_mentoring ? (
                            <span className="rounded-full bg-success/10 px-2.5 py-1 text-success">
                              Mentor
                            </span>
                          ) : null}
                          {row.open_to_opportunities ? (
                            <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning-foreground">
                              Aberto a oportunidades
                            </span>
                          ) : null}
                          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                            Perfil {row.profile_completion ?? 0}%
                          </span>
                        </div>
                        {row.city || row.province || row.country ? (
                          <p className="mt-4 flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                            <MapPin className="size-3.5" />
                            {[row.city, row.province, row.country].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="career">
            <div className="grid gap-4 lg:grid-cols-3">
              <MetricCard
                label="Empregados"
                value={overview?.employed ?? "—"}
                helper="Inclui empreendedorismo"
                icon={BriefcaseBusiness}
              />
              <MetricCard
                label="Abertos a oportunidades"
                value={overview?.openToOpportunities ?? "—"}
                helper="Talent pool disponível"
                icon={UserRoundCheck}
              />
              <MetricCard
                label="Perfil médio"
                value={overview ? `${overview.averageCompletion}%` : "—"}
                helper="Completude de dados Alumni"
                icon={ShieldCheck}
              />
            </div>
          </TabsContent>

          <TabsContent value="opportunities" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {opportunities.length ? (
                opportunities.map((item: any) => (
                  <Card key={item.id} className="border-border/70 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                            {opportunityLabels[item.opportunity_type] ?? item.opportunity_type}
                          </span>
                          <h3 className="mt-3 font-bold">{item.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.organization || "Comunidade Alumni"}
                          </p>
                        </div>
                        <BriefcaseBusiness className="size-5 text-primary" />
                      </div>
                      {item.location ? (
                        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" />
                          {item.location}
                          {item.remote_allowed ? " · Remoto possível" : ""}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="md:col-span-2 xl:col-span-3">
                  <CardContent className="p-8 text-sm text-muted-foreground">
                    Nenhuma oportunidade publicada neste momento.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="mentoring">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Handshake className="size-5 text-primary" />
                    Rede de Mentoria
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  O módulo suporta mentor e mentorado, área de foco, pedido, activação, conclusão e
                  histórico. Use o filtro “Mentores” no directório para descobrir Alumni
                  disponíveis.
                </CardContent>
              </Card>
              <MetricCard
                label="Mentorias activas"
                value={overview?.activeMentorships ?? "—"}
                helper={`${overview?.mentors ?? 0} Alumni disponíveis para orientar`}
                icon={HeartHandshake}
              />
            </div>
          </TabsContent>

          <TabsContent value="events">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {upcomingEvents.length ? (
                upcomingEvents.map((item: any) => (
                  <Card key={item.id} className="border-border/70 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-primary">
                            {item.event_type}
                          </p>
                          <h3 className="mt-2 font-bold">{item.title}</h3>
                        </div>
                        <CalendarDays className="size-5 text-primary" />
                      </div>
                      <p className="mt-4 text-sm font-medium">
                        {new Date(item.starts_at).toLocaleString("pt-PT", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      {item.location ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" />
                          {item.location}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="md:col-span-2 xl:col-span-3">
                  <CardContent className="p-8 text-sm text-muted-foreground">
                    Sem eventos Alumni futuros publicados.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="impact">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Coortes mais representadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topCohorts.length ? (
                    topCohorts.map(([year, count]) => (
                      <div
                        key={year}
                        className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-sm"
                      >
                        <span className="font-semibold">Turma de {year}</span>
                        <span className="text-muted-foreground">{count} Alumni</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>
                  )}
                </CardContent>
              </Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard
                  label="Perfis verificados"
                  value={overview ? `${overview.verificationRate}%` : "—"}
                  helper={`${overview?.verified ?? 0} identidades confirmadas`}
                  icon={ShieldCheck}
                />
                <MetricCard
                  label="Cobertura geográfica"
                  value={overview?.provinces ?? "—"}
                  helper="Províncias representadas"
                  icon={MapPin}
                />
                <MetricCard
                  label="Contribuições"
                  value={
                    overview
                      ? `${Number(overview.aoaContributions).toLocaleString("pt-PT")} Kz`
                      : "—"
                  }
                  helper="Doações e patrocínios registados"
                  icon={HeartHandshake}
                />
                <MetricCard
                  label="Voluntariado"
                  value={overview ? `${overview.volunteerHours} h` : "—"}
                  helper="Horas de serviço à comunidade"
                  icon={Handshake}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
