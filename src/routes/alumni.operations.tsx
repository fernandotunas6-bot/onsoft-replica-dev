import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, CalendarPlus, ClipboardList, Coins, Handshake, Network, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAlumni, listAlumniEvents, listAlumniOpportunities, upsertAlumniEvent, upsertAlumniOpportunity } from "@/features/alumni/server";
import { listAlumniSurveys, recordAlumniContribution, upsertAlumniSurvey } from "@/features/alumni/operations";

export const Route = createFileRoute("/alumni/operations")({
  head: () => ({ meta: [{ title: "Operações Alumni · SIGA" }] }),
  component: AlumniOperationsPage,
});

type QuestionDraft = { id: string; label: string; type: "text" | "textarea" | "number" | "select" | "multiselect" | "boolean" | "date"; required: boolean; options: string };

function AlumniOperationsPage() {
  const queryClient = useQueryClient();
  const [opportunityTitle, setOpportunityTitle] = useState("");
  const [opportunityOrg, setOpportunityOrg] = useState("");
  const [opportunityType, setOpportunityType] = useState<"job" | "internship" | "scholarship" | "mentoring" | "business" | "volunteer" | "event" | "other">("job");
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [surveyTitle, setSurveyTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ id: "q1", label: "", type: "text", required: true, options: "" }]);
  const [contributionAlumniId, setContributionAlumniId] = useState("");
  const [contributionType, setContributionType] = useState<"donation" | "sponsorship" | "scholarship" | "in_kind" | "volunteer_hours" | "other">("donation");
  const [contributionValue, setContributionValue] = useState("");
  const [contributionDesignation, setContributionDesignation] = useState("");

  const alumniQuery = useQuery({ queryKey: ["alumni", "operations", "people"], queryFn: () => listAlumni({ data: { limit: 200, offset: 0 } }) });
  const opportunitiesQuery = useQuery({ queryKey: ["alumni", "operations", "opportunities"], queryFn: () => listAlumniOpportunities({ data: { limit: 200 } }) });
  const eventsQuery = useQuery({ queryKey: ["alumni", "operations", "events"], queryFn: () => listAlumniEvents() });
  const surveysQuery = useQuery({ queryKey: ["alumni", "operations", "surveys"], queryFn: () => listAlumniSurveys() });

  const invalidateOperations = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["alumni", "operations"] }),
      queryClient.invalidateQueries({ queryKey: ["alumni", "overview"] }),
      queryClient.invalidateQueries({ queryKey: ["alumni", "opportunities"] }),
      queryClient.invalidateQueries({ queryKey: ["alumni", "events"] }),
    ]);
  };

  const opportunityMutation = useMutation({
    mutationFn: () => upsertAlumniOpportunity({ data: { title: opportunityTitle, organization: opportunityOrg || undefined, opportunityType, remoteAllowed: false, status: "published" } }),
    onSuccess: async () => { toast.success("Oportunidade publicada."); setOpportunityTitle(""); setOpportunityOrg(""); await invalidateOperations(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível publicar a oportunidade."),
  });

  const eventMutation = useMutation({
    mutationFn: () => upsertAlumniEvent({ data: { title: eventTitle, eventType: "networking", location: eventLocation || undefined, startsAt: new Date(eventStart).toISOString(), status: "published" } }),
    onSuccess: async () => { toast.success("Evento Alumni publicado."); setEventTitle(""); setEventStart(""); setEventLocation(""); await invalidateOperations(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível publicar o evento."),
  });

  const surveyMutation = useMutation({
    mutationFn: () => upsertAlumniSurvey({ data: {
      title: surveyTitle,
      purpose: "tracer_study",
      schemaJson: questions.filter((q) => q.label.trim()).map((q) => ({ id: q.id, label: q.label.trim(), type: q.type, required: q.required, options: ["select", "multiselect"].includes(q.type) ? q.options.split("\n").map((item) => item.trim()).filter(Boolean) : undefined })),
      status: "published",
    } }),
    onSuccess: async () => { toast.success("Tracer study publicado."); setSurveyTitle(""); setQuestions([{ id: "q1", label: "", type: "text", required: true, options: "" }]); await invalidateOperations(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível publicar a pesquisa."),
  });

  const contributionMutation = useMutation({
    mutationFn: () => recordAlumniContribution({ data: {
      alumniId: contributionAlumniId,
      contributionType,
      amount: contributionType === "volunteer_hours" ? undefined : Number(contributionValue),
      hours: contributionType === "volunteer_hours" ? Number(contributionValue) : undefined,
      currency: "AOA",
      designation: contributionDesignation || undefined,
    } }),
    onSuccess: async () => { toast.success("Contribuição registada."); setContributionValue(""); setContributionDesignation(""); await invalidateOperations(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível registar a contribuição."),
  });

  const publishedOpportunities = useMemo(() => (opportunitiesQuery.data ?? []).filter((row) => row.status === "published").length, [opportunitiesQuery.data]);
  const upcomingEvents = useMemo(() => (eventsQuery.data ?? []).filter((row) => row.status === "published" && new Date(row.starts_at).getTime() >= Date.now()).length, [eventsQuery.data]);
  const activeSurveys = useMemo(() => (surveysQuery.data ?? []).filter((row) => row.status === "published").length, [surveysQuery.data]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><Sparkles className="size-3.5" /> Alumni Operations Center</div><h1 className="mt-3 text-3xl font-black tracking-tight">Centro Operacional Alumni</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Publique oportunidades e eventos, construa tracer studies e registe o impacto dos antigos alunos sem sair do SIGA.</p></div>
            <div className="flex flex-wrap gap-2"><Link to="/alumni" className="inline-flex h-10 items-center rounded-xl border border-input px-4 text-sm font-medium"><Network className="mr-2 size-4" />Rede Alumni</Link><Link to="/alumni/insights" className="inline-flex h-10 items-center rounded-xl border border-input px-4 text-sm font-medium">Insights</Link></div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="p-5"><BriefcaseBusiness className="size-5 text-primary" /><p className="mt-3 text-3xl font-black">{publishedOpportunities}</p><p className="text-xs text-muted-foreground">Oportunidades publicadas</p></CardContent></Card>
          <Card><CardContent className="p-5"><CalendarPlus className="size-5 text-primary" /><p className="mt-3 text-3xl font-black">{upcomingEvents}</p><p className="text-xs text-muted-foreground">Eventos futuros</p></CardContent></Card>
          <Card><CardContent className="p-5"><ClipboardList className="size-5 text-primary" /><p className="mt-3 text-3xl font-black">{activeSurveys}</p><p className="text-xs text-muted-foreground">Tracer studies activos</p></CardContent></Card>
        </section>

        <Tabs defaultValue="opportunities" className="space-y-4">
          <TabsList className="h-auto flex-wrap rounded-2xl bg-muted/60 p-1"><TabsTrigger value="opportunities" className="rounded-xl">Oportunidades</TabsTrigger><TabsTrigger value="events" className="rounded-xl">Eventos</TabsTrigger><TabsTrigger value="surveys" className="rounded-xl">Tracer Studies</TabsTrigger><TabsTrigger value="impact" className="rounded-xl">Contribuições</TabsTrigger></TabsList>

          <TabsContent value="opportunities"><Card><CardHeader><CardTitle>Publicar oportunidade</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Input value={opportunityTitle} onChange={(e) => setOpportunityTitle(e.target.value)} placeholder="Título da oportunidade" /><Input value={opportunityOrg} onChange={(e) => setOpportunityOrg(e.target.value)} placeholder="Empresa / organização" /><select value={opportunityType} onChange={(e) => setOpportunityType(e.target.value as typeof opportunityType)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="job">Emprego</option><option value="internship">Estágio</option><option value="scholarship">Bolsa</option><option value="mentoring">Mentoria</option><option value="business">Negócio</option><option value="volunteer">Voluntariado</option><option value="event">Evento</option><option value="other">Outra</option></select><div className="md:col-span-2"><Button onClick={() => opportunityMutation.mutate()} disabled={!opportunityTitle.trim() || opportunityMutation.isPending}><Plus className="mr-2 size-4" />Publicar oportunidade</Button></div></CardContent></Card></TabsContent>

          <TabsContent value="events"><Card><CardHeader><CardTitle>Criar evento Alumni</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Nome do evento" /><Input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Local / cidade" /><Input type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} /><div className="md:col-span-2"><Button onClick={() => eventMutation.mutate()} disabled={!eventTitle.trim() || !eventStart || eventMutation.isPending}><CalendarPlus className="mr-2 size-4" />Publicar evento</Button></div></CardContent></Card></TabsContent>

          <TabsContent value="surveys"><Card><CardHeader><CardTitle>Construtor de Tracer Study</CardTitle></CardHeader><CardContent className="space-y-4"><Input value={surveyTitle} onChange={(e) => setSurveyTitle(e.target.value)} placeholder="Título da pesquisa" />{questions.map((question, index) => <div key={question.id} className="grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto]"><Input value={question.label} onChange={(e) => setQuestions((current) => current.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} placeholder={`Pergunta ${index + 1}`} /><select value={question.type} onChange={(e) => setQuestions((current) => current.map((item, i) => i === index ? { ...item, type: e.target.value as QuestionDraft["type"] } : item))} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="text">Texto</option><option value="textarea">Texto longo</option><option value="number">Número</option><option value="select">Selecção</option><option value="multiselect">Múltipla selecção</option><option value="boolean">Sim/Não</option><option value="date">Data</option></select><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={question.required} onChange={(e) => setQuestions((current) => current.map((item, i) => i === index ? { ...item, required: e.target.checked } : item))} />Obrigatória</label>{["select", "multiselect"].includes(question.type) ? <textarea className="min-h-20 rounded-xl border border-input bg-background p-3 text-sm md:col-span-3" value={question.options} onChange={(e) => setQuestions((current) => current.map((item, i) => i === index ? { ...item, options: e.target.value } : item))} placeholder="Uma opção por linha" /> : null}</div>)}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setQuestions((current) => [...current, { id: `q${current.length + 1}`, label: "", type: "text", required: false, options: "" }])}><Plus className="mr-2 size-4" />Adicionar pergunta</Button><Button onClick={() => surveyMutation.mutate()} disabled={!surveyTitle.trim() || !questions.some((q) => q.label.trim()) || surveyMutation.isPending}><ClipboardList className="mr-2 size-4" />Publicar tracer study</Button></div></CardContent></Card></TabsContent>

          <TabsContent value="impact"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Coins className="size-5 text-primary" />Registar contribuição Alumni</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><select value={contributionAlumniId} onChange={(e) => setContributionAlumniId(e.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">Seleccionar Alumni…</option>{(alumniQuery.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.full_name} · {row.student_number}</option>)}</select><select value={contributionType} onChange={(e) => setContributionType(e.target.value as typeof contributionType)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="donation">Doação</option><option value="sponsorship">Patrocínio</option><option value="scholarship">Bolsa</option><option value="in_kind">Em espécie</option><option value="volunteer_hours">Horas de voluntariado</option><option value="other">Outra</option></select><Input type="number" min="0" value={contributionValue} onChange={(e) => setContributionValue(e.target.value)} placeholder={contributionType === "volunteer_hours" ? "Horas" : "Valor em Kz"} /><Input value={contributionDesignation} onChange={(e) => setContributionDesignation(e.target.value)} placeholder="Finalidade / projecto" /><div className="md:col-span-2"><Button onClick={() => contributionMutation.mutate()} disabled={!contributionAlumniId || !contributionValue || contributionMutation.isPending}><Handshake className="mr-2 size-4" />Registar impacto</Button></div></CardContent></Card></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
