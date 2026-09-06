import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Building2,
  CircleUserRound,
  GraduationCap,
  Handshake,
  MapPin,
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
import { bootstrapGraduatedStudents, getAlumniOverview, listAlumni } from "@/features/alumni/server";

export const Route = createFileRoute("/alumni")({
  head: () => ({
    meta: [
      { title: "Alumni · SIGA" },
      {
        name: "description",
        content:
          "Rede premium de antigos alunos: empregabilidade, mentoria, oportunidades, trajectórias e relacionamento institucional.",
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

  const overviewQuery = useQuery({
    queryKey: ["alumni", "overview"],
    queryFn: () => getAlumniOverview(),
  });

  const alumniQuery = useQuery({
    queryKey: ["alumni", "directory", query, employment, mentoringOnly],
    queryFn: () =>
      listAlumni({
        data: {
          query,
          employmentStatus:
            employment === "all"
              ? undefined
              : (employment as
                  | "employed"
                  | "self_employed"
                  | "student"
                  | "seeking"
                  | "unavailable"
                  | "unknown"),
          mentoringOnly,
          limit: 100,
          offset: 0,
        },
      }),
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
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao sincronizar Alumni."),
  });

  const overview = overviewQuery.data;
  const alumni = alumniQuery.data ?? [];
  const topCohorts = useMemo(() => {
    const counts = new Map<number, number>();
    alumni.forEach((row) => {
      if (row.graduation_year) counts.set(row.graduation_year, (counts.get(row.graduation_year) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
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
                Acompanhe os antigos alunos depois da conclusão: trajectória profissional, empregabilidade,
                mentoria, oportunidades, impacto e relacionamento com a instituição.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
          <MetricCard label="Rede Alumni" value={overview?.total ?? "—"} helper="Perfis pós-formação activos" icon={Network} />
          <MetricCard label="Empregabilidade" value={overview ? `${overview.employmentRate}%` : "—"} helper={`${overview?.employed ?? 0} empregados/empreendedores`} icon={TrendingUp} />
          <MetricCard label="Mentores" value={overview?.mentors ?? "—"} helper="Disponíveis para orientar" icon={Handshake} />
          <MetricCard label="Oportunidades" value={overview?.opportunities ?? "—"} helper="Publicadas para a comunidade" icon={BriefcaseBusiness} />
        </section>

        <Tabs defaultValue="directory" className="space-y-4">
          <TabsList className="h-auto flex-wrap rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="directory" className="rounded-xl">Directório</TabsTrigger>
            <TabsTrigger value="career" className="rounded-xl">Carreira & Talento</TabsTrigger>
            <TabsTrigger value="mentoring" className="rounded-xl">Mentoria</TabsTrigger>
            <TabsTrigger value="impact" className="rounded-xl">Impacto</TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="space-y-4">
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-4 md:p-5">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <label className="relative block">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Pesquisar nome, processo, empresa, função, área ou localização…"
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
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <Button
                    variant={mentoringOnly ? "default" : "outline"}
                    onClick={() => setMentoringOnly((value) => !value)}
                    className="rounded-xl"
                  >
                    <Handshake className="mr-2 size-4" /> Mentores
                  </Button>
                </div>
              </CardContent>
            </Card>

            {alumniQuery.isLoading ? (
              <Card><CardContent className="p-8 text-sm text-muted-foreground">A carregar a rede Alumni…</CardContent></Card>
            ) : alumni.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <CircleUserRound className="size-10 text-muted-foreground" />
                  <h2 className="mt-4 text-lg font-bold">Ainda não há Alumni neste filtro</h2>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    Sincronize os alunos com estado “Concluído” ou altere os filtros. O perfil Alumni mantém ligação ao registo académico original.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {alumni.map((row) => (
                  <Card key={row.id} className="group border-border/70 shadow-sm transition-shadow hover:shadow-md">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <MediaAvatar src={row.photo_url} alt={row.full_name} className="size-12 rounded-2xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate font-bold text-foreground">{row.full_name}</h3>
                            {row.verified_at ? <ShieldCheck className="size-4 shrink-0 text-primary" /> : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.student_number}</p>
                        </div>
                      </div>

                      <div className="mt-4 min-h-12">
                        <p className="text-sm font-semibold text-foreground">
                          {row.current_role || row.headline || "Trajectória por actualizar"}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="size-3.5" /> {row.current_company || employmentLabels[row.employment_status] || "Sem organização"}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
                        {row.graduation_year ? (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Turma {row.graduation_year}</span>
                        ) : null}
                        {row.available_for_mentoring ? (
                          <span className="rounded-full bg-success/10 px-2.5 py-1 text-success">Mentor</span>
                        ) : null}
                        {row.open_to_opportunities ? (
                          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning-foreground">Aberto a oportunidades</span>
                        ) : null}
                      </div>

                      {(row.city || row.province || row.country) ? (
                        <p className="mt-4 flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" />
                          {[row.city, row.province, row.country].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="career">
            <div className="grid gap-4 lg:grid-cols-3">
              <MetricCard label="Empregados" value={overview?.employed ?? "—"} helper="Inclui empreendedorismo" icon={BriefcaseBusiness} />
              <MetricCard label="Abertos a oportunidades" value={overview?.openToOpportunities ?? "—"} helper="Talent pool disponível" icon={UserRoundCheck} />
              <MetricCard label="Coortes acompanhadas" value={overview?.cohorts ?? "—"} helper="Anos de conclusão representados" icon={GraduationCap} />
            </div>
          </TabsContent>

          <TabsContent value="mentoring">
            <Card className="border-border/70 shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Handshake className="size-5 text-primary" /> Rede de Mentoria</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                O modelo já suporta antigos alunos disponíveis para mentoria, alumni que procuram mentor e ligação futura a sessões, programas e métricas de acompanhamento.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="impact">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              <Card className="border-border/70 shadow-sm">
                <CardHeader><CardTitle>Coortes mais representadas</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {topCohorts.length ? topCohorts.map(([year, count]) => (
                    <div key={year} className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-sm">
                      <span className="font-semibold">Turma de {year}</span><span className="text-muted-foreground">{count} Alumni</span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>}
                </CardContent>
              </Card>
              <MetricCard label="Perfis verificados" value={overview ? `${overview.verificationRate}%` : "—"} helper={`${overview?.verified ?? 0} identidades confirmadas`} icon={ShieldCheck} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
