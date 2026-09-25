import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Handshake,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, StatGrid } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MediaAvatar } from "@/components/ui/media-frame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlumniPrivacyPanel } from "@/features/alumni/AlumniPrivacyPanel";
import { AlumniSurveyForm } from "@/features/alumni/AlumniSurveyForm";
import {
  claimMyAlumniProfile,
  getMyAlumniPortal,
  registerMyAlumniEvent,
  saveMyOpportunityInterest,
  submitMyAlumniSurvey,
  updateMyAlumniProfile,
} from "@/features/alumni/self-service";

export const Route = createFileRoute("/alumni/portal")({
  head: () => ({
    meta: [
      { title: "Meu Portal Alumni · SIGA" },
      {
        name: "description",
        content:
          "Portal pessoal do antigo aluno: carreira, oportunidades, eventos, mentoria, tracer studies e privacidade.",
      },
    ],
  }),
  component: AlumniPortalPage,
});

function AlumniPortalPage() {
  const queryClient = useQueryClient();
  const portalQuery = useQuery({
    queryKey: ["alumni", "self-service"],
    queryFn: () => getMyAlumniPortal(),
    retry: false,
  });
  const portal = portalQuery.data;
  const [headline, setHeadline] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [province, setProvince] = useState("");

  const profileCompletion = portal?.profile?.profile_completion ?? 0;
  const registeredEventIds = useMemo(
    () =>
      new Set(
        (portal?.registrations ?? [])
          .filter((row) => row.status !== "cancelled")
          .map((row) => row.event_id),
      ),
    [portal?.registrations],
  );
  const applicationByOpportunity = useMemo(
    () => new Map((portal?.applications ?? []).map((row) => [row.opportunity_id, row])),
    [portal?.applications],
  );

  const claimMutation = useMutation({
    mutationFn: () => claimMyAlumniProfile(),
    onSuccess: async () => {
      toast.success("Portal Alumni activado com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "self-service"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível activar o portal Alumni.",
      ),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateMyAlumniProfile({
        data: {
          headline: headline || undefined,
          currentCompany: company || undefined,
          currentRole: role || undefined,
          province: province || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Perfil actualizado.");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "self-service"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o perfil."),
  });

  const opportunityMutation = useMutation({
    mutationFn: ({
      opportunityId,
      status,
    }: {
      opportunityId: string;
      status: "interested" | "applied" | "withdrawn";
    }) => saveMyOpportunityInterest({ data: { opportunityId, status } }),
    onSuccess: async () => {
      toast.success("Oportunidade actualizada.");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "self-service"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível actualizar a oportunidade.",
      ),
  });

  const eventMutation = useMutation({
    mutationFn: (eventId: string) => registerMyAlumniEvent({ data: { eventId } }),
    onSuccess: async (result) => {
      toast.success(
        result.status === "waitlist" ? "Adicionado à lista de espera." : "Inscrição confirmada.",
      );
      await queryClient.invalidateQueries({ queryKey: ["alumni", "self-service"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível efectuar a inscrição.",
      ),
  });

  if (portalQuery.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">
          A preparar o seu Portal Alumni…
        </div>
      </AppShell>
    );
  }

  if (!portal) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardContent className="p-8 text-center md:p-12">
              <div className="mx-auto inline-flex size-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <GraduationCap className="size-7" />
              </div>
              <h1 className="mt-5 text-2xl font-black tracking-tight">
                Activar o meu Portal Alumni
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                O SIGA valida o e-mail da sua conta com o registo oficial de Pessoa e com o processo
                Alumni da escola. Nenhum histórico académico é duplicado.
              </p>
              <Button
                className="mt-6 rounded-xl"
                onClick={() => claimMutation.mutate()}
                disabled={claimMutation.isPending}
              >
                <UserRoundCheck className="mr-2 size-4" />{" "}
                {claimMutation.isPending ? "A validar…" : "Validar e activar"}
              </Button>
              {portalQuery.error ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  {portalQuery.error instanceof Error
                    ? portalQuery.error.message
                    : "Acesso ainda não activado."}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          group="Alumni"
          title={portal.person?.full_name ?? "Meu Portal Alumni"}
          description={
            portal.profile.headline ||
            portal.profile.current_role ||
            "Actualize a sua trajectória profissional, oportunidades, eventos e rede de mentoria."
          }
          icon={GraduationCap}
          crumbs={[{ label: "Início", to: "/" }, { label: "Meu Portal Alumni" }]}
          actions={
            <div className="flex items-center gap-3">
              <div className="min-w-44 rounded-xl border border-border/70 bg-card p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground">Perfil completo</span>
                  <span className="font-black text-primary">{profileCompletion}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${profileCompletion}%` }}
                  />
                </div>
              </div>
            </div>
          }
        />

        <StatGrid>
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-5">
              <BriefcaseBusiness className="size-5 text-primary" />
              <p className="mt-3 text-2xl font-black">{portal.opportunities.length}</p>
              <p className="text-xs text-muted-foreground">Oportunidades disponíveis</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-5">
              <CalendarDays className="size-5 text-primary" />
              <p className="mt-3 text-2xl font-black">{portal.events.length}</p>
              <p className="text-xs text-muted-foreground">Próximos eventos</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-5">
              <Handshake className="size-5 text-primary" />
              <p className="mt-3 text-2xl font-black">{portal.mentorships.length}</p>
              <p className="text-xs text-muted-foreground">Relações de mentoria</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-5">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="mt-3 text-2xl font-black">{portal.surveys.length}</p>
              <p className="text-xs text-muted-foreground">Pesquisas activas</p>
            </CardContent>
          </Card>
        </StatGrid>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="h-auto flex-wrap rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="profile" className="rounded-xl">
              Meu perfil
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="rounded-xl">
              Oportunidades
            </TabsTrigger>
            <TabsTrigger value="events" className="rounded-xl">
              Eventos
            </TabsTrigger>
            <TabsTrigger value="surveys" className="rounded-xl">
              Tracer Studies
            </TabsTrigger>
            <TabsTrigger value="privacy" className="rounded-xl">
              <ShieldCheck className="mr-1.5 size-3.5" />
              Privacidade
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Trajectória profissional</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Input
                  id="alumni-headline"
                  aria-label="Título profissional ou headline"
                  defaultValue={portal.profile.headline ?? ""}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder="Título profissional / headline"
                  className="rounded-xl"
                />
                <Input
                  id="alumni-company"
                  aria-label="Empresa ou organização"
                  defaultValue={portal.profile.current_company ?? ""}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Empresa / organização"
                  className="rounded-xl"
                />
                <Input
                  id="alumni-role"
                  aria-label="Função actual"
                  defaultValue={portal.profile.current_role ?? ""}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="Função actual"
                  className="rounded-xl"
                />
                <Input
                  id="alumni-province"
                  aria-label="Província"
                  defaultValue={portal.profile.province ?? ""}
                  onChange={(event) => setProvince(event.target.value)}
                  placeholder="Província"
                  className="rounded-xl"
                />
                <div className="md:col-span-2">
                  <Button
                    onClick={() => updateMutation.mutate()}
                    disabled={updateMutation.isPending}
                    className="rounded-xl"
                  >
                    {updateMutation.isPending ? "A guardar…" : "Guardar trajectória"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="opportunities" className="grid gap-4 md:grid-cols-2">
            {portal.opportunities.map((item) => {
              const current = applicationByOpportunity.get(item.id);
              return (
                <Card key={item.id} className="border-border/70 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-primary">{item.opportunity_type}</p>
                        <h3 className="mt-1 font-bold">{item.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.organization || "Rede Alumni"}
                        </p>
                      </div>
                      {item.remote_allowed ? (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                          Remoto
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {item.description || "Oportunidade publicada para a comunidade Alumni."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={current?.status === "interested" ? "default" : "outline"}
                        onClick={() =>
                          opportunityMutation.mutate({
                            opportunityId: item.id,
                            status: "interested",
                          })
                        }
                      >
                        Tenho interesse
                      </Button>
                      <Button
                        size="sm"
                        variant={current?.status === "applied" ? "default" : "outline"}
                        onClick={() =>
                          opportunityMutation.mutate({ opportunityId: item.id, status: "applied" })
                        }
                      >
                        Candidatei-me
                      </Button>
                      {current && current.status !== "withdrawn" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            opportunityMutation.mutate({
                              opportunityId: item.id,
                              status: "withdrawn",
                            })
                          }
                        >
                          Retirar
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="events" className="grid gap-4 md:grid-cols-2">
            {portal.events.map((event) => (
              <Card key={event.id}>
                <CardContent className="p-5">
                  <p className="text-xs font-bold text-primary">{event.event_type}</p>
                  <h3 className="mt-1 font-bold">{event.title}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(event.starts_at).toLocaleString("pt-AO")}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  <Button
                    className="mt-4"
                    size="sm"
                    variant={registeredEventIds.has(event.id) ? "outline" : "default"}
                    disabled={registeredEventIds.has(event.id)}
                    onClick={() => eventMutation.mutate(event.id)}
                  >
                    {registeredEventIds.has(event.id) ? "Inscrito" : "Inscrever-me"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="surveys" className="space-y-4">
            {portal.surveys.length ? (
              portal.surveys.map((survey) => (
                <Card key={survey.id} className="border-border/70 shadow-sm">
                  <CardHeader>
                    <CardTitle>{survey.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-muted-foreground">
                      {survey.description || "Ajude a escola a acompanhar o impacto da formação."}
                    </p>
                    <AlumniSurveyForm
                      schema={survey.schema_json}
                      onSubmit={(response) =>
                        submitMyAlumniSurvey({ data: { surveyId: survey.id, response } }).then(
                          async () => {
                            toast.success("Respostas enviadas.");
                            await queryClient.invalidateQueries({
                              queryKey: ["alumni", "self-service"],
                            });
                          },
                        )
                      }
                    />
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-sm text-muted-foreground">
                  Não há tracer studies activos neste momento.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="privacy">
            <AlumniPrivacyPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
