import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FolderKanban, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  alumniPortfolioEducationLevels,
  alumniPortfolioItemTypes,
  deleteMyAlumniPortfolioItem,
  getMyAlumniPortfolio,
  getMyPortfolioDocumentOptions,
  saveMyAlumniPortfolioItem,
} from "@/features/alumni/portfolio";

export const Route = createFileRoute("/alumni/portal/portfolio")({
  head: () => ({ meta: [{ title: "Meu Portfólio Alumni · SIGA" }] }),
  component: AlumniPortfolioPage,
});

const typeLabels: Record<string, string> = {
  project: "Projecto",
  publication: "Publicação",
  award: "Prémio",
  certificate: "Certificado",
  media: "Media",
  link: "Link",
  case_study: "Caso de estudo",
  other: "Outro",
};

const levelLabels: Record<string, string> = {
  primary: "Primária",
  middle: "Ensino Médio",
  higher: "Ensino Superior",
};

function splitTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function AlumniPortfolioPage() {
  const queryClient = useQueryClient();
  const [itemType, setItemType] = useState<(typeof alumniPortfolioItemTypes)[number]>("project");
  const [educationLevel, setEducationLevel] = useState<(typeof alumniPortfolioEducationLevels)[number]>("primary");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [skills, setSkills] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"private" | "school" | "alumni">("alumni");
  const [featured, setFeatured] = useState(false);
  const [officialDocumentRequestId, setOfficialDocumentRequestId] = useState("");

  const portfolioQuery = useQuery({ queryKey: ["alumni", "portfolio", "mine"], queryFn: () => getMyAlumniPortfolio() });
  const documentsQuery = useQuery({ queryKey: ["alumni", "portfolio", "documents"], queryFn: () => getMyPortfolioDocumentOptions() });

  const saveMutation = useMutation({
    mutationFn: () => saveMyAlumniPortfolioItem({ data: {
      itemType,
      educationLevel,
      title,
      summary: summary || undefined,
      organization: organization || undefined,
      role: role || undefined,
      externalUrl: externalUrl || undefined,
      imageUrl: imageUrl || undefined,
      officialDocumentRequestId: officialDocumentRequestId || undefined,
      skills: splitTags(skills),
      tags: splitTags(tags),
      featured,
      visibility,
    } }),
    onSuccess: async () => {
      toast.success("Item adicionado ao portfólio.");
      setTitle(""); setSummary(""); setOrganization(""); setRole(""); setExternalUrl(""); setImageUrl(""); setSkills(""); setTags(""); setOfficialDocumentRequestId(""); setFeatured(false);
      await queryClient.invalidateQueries({ queryKey: ["alumni", "portfolio"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível guardar o portfólio."),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteMyAlumniPortfolioItem({ data: { itemId } }),
    onSuccess: async () => {
      toast.success("Item removido do portfólio.");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "portfolio"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível remover o item."),
  });

  const items = portfolioQuery.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><Sparkles className="size-3.5" /> Identidade profissional</div>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Meu Portfólio Alumni</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Organize projectos, publicações, prémios, certificados e outras evidências por Primária, Ensino Médio ou Ensino Superior. O histórico permanece no mesmo portfólio.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/alumni/portal/portfolio/showcase" className="inline-flex h-10 items-center rounded-xl border border-input px-4 text-sm font-medium">Ver apresentação</Link>
              <Link to="/alumni/portal" className="inline-flex h-10 items-center rounded-xl border border-input px-4 text-sm font-medium">Voltar ao Portal Alumni</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="h-fit border-border/70 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-5 text-primary" />Adicionar ao portfólio</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <select value={educationLevel} onChange={(e) => setEducationLevel(e.target.value as typeof educationLevel)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">{alumniPortfolioEducationLevels.map((level) => <option key={level} value={level}>{levelLabels[level]}</option>)}</select>
              <select value={itemType} onChange={(e) => setItemType(e.target.value as typeof itemType)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">{alumniPortfolioItemTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do projecto / evidência" />
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Descrição breve, impacto ou resultado" className="min-h-28 w-full rounded-xl border border-input bg-background p-3 text-sm" />
              <div className="grid gap-3 sm:grid-cols-2"><Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Organização" /><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Seu papel" /></div>
              <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https:// projecto, artigo, GitHub, vídeo…" />
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL de capa / imagem" />
              <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Competências, separadas por vírgula" />
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, separadas por vírgula" />
              <select value={officialDocumentRequestId} onChange={(e) => setOfficialDocumentRequestId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">Sem documento oficial associado</option>{(documentsQuery.data ?? []).map((doc) => <option key={doc.id} value={doc.id}>{doc.request_type || "Documento"} · {doc.status}</option>)}</select>
              <div className="grid gap-3 sm:grid-cols-2"><select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="alumni">Visível à rede Alumni</option><option value="school">Visível à escola</option><option value="private">Privado</option></select><label className="flex h-10 items-center gap-2 rounded-xl border border-input px-3 text-sm"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />Destacar</label></div>
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={title.trim().length < 2 || saveMutation.isPending}><Plus className="mr-2 size-4" />{saveMutation.isPending ? "A guardar…" : "Adicionar item"}</Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Portfólio</h2><p className="text-sm text-muted-foreground">{items.length} item(ns)</p></div><FolderKanban className="size-5 text-primary" /></div>
            {portfolioQuery.isLoading ? <Card><CardContent className="p-8 text-sm text-muted-foreground">A carregar portfólio…</CardContent></Card> : items.length ? <div className="grid gap-4 md:grid-cols-2">{items.map((item: any) => <Card key={item.id} className="overflow-hidden border-border/70 shadow-sm">{item.image_url ? <img src={item.image_url} alt="" className="h-40 w-full object-cover" /> : null}<CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">{item.education_level ? levelLabels[item.education_level] : "Sem nível"}</span><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase text-primary">{typeLabels[item.item_type] || item.item_type}</span>{item.featured ? <span className="inline-flex items-center rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-bold"><Star className="mr-1 size-3" />Destaque</span> : null}</div><h3 className="mt-3 font-bold">{item.title}</h3><p className="mt-1 text-xs text-muted-foreground">{[item.role, item.organization].filter(Boolean).join(" · ") || "Portfólio Alumni"}</p></div><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="size-4" /></Button></div>{item.summary ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.summary}</p> : null}{item.skills?.length ? <div className="mt-4 flex flex-wrap gap-1.5">{item.skills.map((skill: string) => <span key={skill} className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold">{skill}</span>)}</div> : null}<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">{item.external_url ? <a href={item.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-semibold text-primary">Abrir evidência <ExternalLink className="ml-1 size-3" /></a> : null}{item.document_requests ? <span className="text-xs text-muted-foreground">Documento SIGA: {item.document_requests.request_type || "Documento"}</span> : null}<span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">{item.visibility}</span></div></CardContent></Card>)}</div> : <Card className="border-dashed"><CardContent className="p-10 text-center"><FolderKanban className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-3 font-bold">O seu portfólio ainda está vazio</h3><p className="mt-2 text-sm text-muted-foreground">Adicione o primeiro projecto, prémio, publicação ou certificado.</p></CardContent></Card>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
