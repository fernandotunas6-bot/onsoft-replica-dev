import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GraduationCap, Plus, School, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { alumniPortfolioEducationLevels } from "@/features/alumni/portfolio";
import { deleteMyAlumniEducationStage, getMyAlumniEducationHistory, saveMyAlumniEducationStage } from "@/features/alumni/education-history";

export const Route = createFileRoute("/alumni/portal/portfolio/education")({
  head: () => ({ meta: [{ title: "Percurso Educacional · Portfólio SIGA" }] }),
  component: AlumniPortfolioEducationPage,
});

const levelLabels: Record<string, string> = { primary: "Primária", middle: "Ensino Médio", higher: "Ensino Superior" };

function AlumniPortfolioEducationPage() {
  const queryClient = useQueryClient();
  const [educationLevel, setEducationLevel] = useState<(typeof alumniPortfolioEducationLevels)[number]>("primary");
  const [institutionName, setInstitutionName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [degreeName, setDegreeName] = useState("");
  const [startedYear, setStartedYear] = useState("");
  const [endedYear, setEndedYear] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");

  const historyQuery = useQuery({ queryKey: ["alumni", "education", "mine"], queryFn: () => getMyAlumniEducationHistory() });
  const saveMutation = useMutation({
    mutationFn: () => saveMyAlumniEducationStage({ data: {
      educationLevel,
      institutionName,
      courseName: courseName || undefined,
      degreeName: degreeName || undefined,
      startedYear: startedYear ? Number(startedYear) : undefined,
      endedYear: endedYear ? Number(endedYear) : undefined,
      city: city || undefined,
      province: province || undefined,
      country: "Angola",
    } }),
    onSuccess: async () => {
      toast.success("Instituição adicionada ao percurso.");
      setInstitutionName(""); setCourseName(""); setDegreeName(""); setStartedYear(""); setEndedYear(""); setCity(""); setProvince("");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "education"] });
      await queryClient.invalidateQueries({ queryKey: ["alumni", "portfolio"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível guardar a instituição."),
  });
  const deleteMutation = useMutation({
    mutationFn: (stageId: string) => deleteMyAlumniEducationStage({ data: { stageId } }),
    onSuccess: async () => { toast.success("Instituição removida do percurso."); await queryClient.invalidateQueries({ queryKey: ["alumni", "education"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível remover a instituição."),
  });

  const stages = historyQuery.data ?? [];

  return <AppShell><div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" asChild><Link to="/alumni/portal/portfolio"><ArrowLeft className="mr-2 size-4" />Voltar ao portfólio</Link></Button><span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Percurso educacional</span></div>

    <section className="border-b border-border/60 pb-8"><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Onde estudou</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Registe cada instituição frequentada. Se estudou em duas escolas diferentes no Ensino Médio, adicione as duas; o portfólio poderá filtrar cada uma separadamente.</p></section>

    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="h-fit"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4" />Adicionar instituição</CardTitle></CardHeader><CardContent className="space-y-3">
        <select value={educationLevel} onChange={(e) => setEducationLevel(e.target.value as typeof educationLevel)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">{alumniPortfolioEducationLevels.map((level) => <option key={level} value={level}>{levelLabels[level]}</option>)}</select>
        <Input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} placeholder="Nome da escola / universidade" />
        <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Curso / área (opcional)" />
        <Input value={degreeName} onChange={(e) => setDegreeName(e.target.value)} placeholder="Grau alcançado (opcional)" />
        <div className="grid grid-cols-2 gap-3"><Input inputMode="numeric" value={startedYear} onChange={(e) => setStartedYear(e.target.value)} placeholder="Ano inicial" /><Input inputMode="numeric" value={endedYear} onChange={(e) => setEndedYear(e.target.value)} placeholder="Ano final" /></div>
        <div className="grid grid-cols-2 gap-3"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Município / cidade" /><Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Província" /></div>
        <Button className="w-full" disabled={institutionName.trim().length < 2 || saveMutation.isPending} onClick={() => saveMutation.mutate()}><Plus className="mr-2 size-4" />Adicionar instituição</Button>
      </CardContent></Card>

      <div className="space-y-8">{alumniPortfolioEducationLevels.map((level) => { const rows = stages.filter((stage: any) => stage.education_level === level); return <section key={level}><div className="mb-3 flex items-center gap-2"><GraduationCap className="size-4 text-muted-foreground" /><h2 className="text-lg font-black">{levelLabels[level]}</h2><span className="text-xs text-muted-foreground">{rows.length}</span></div>{rows.length ? <div className="divide-y divide-border/60 border-y border-border/60">{rows.map((stage: any) => <div key={stage.id} className="flex items-start gap-4 py-5"><School className="mt-1 size-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="font-semibold">{stage.institution_name}</p><p className="mt-1 text-sm text-muted-foreground">{[stage.course_name, stage.degree_name].filter(Boolean).join(" · ") || "Instituição de formação"}</p><p className="mt-2 text-xs text-muted-foreground">{[[stage.started_year, stage.ended_year].filter(Boolean).join(" — "), [stage.city, stage.province, stage.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p></div><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(stage.id)}><Trash2 className="size-4" /></Button></div>)}</div> : <p className="border-t border-border/60 py-5 text-sm text-muted-foreground">Nenhuma instituição registada neste nível.</p>}</section>; })}</div>
    </div>
  </div></AppShell>;
}
