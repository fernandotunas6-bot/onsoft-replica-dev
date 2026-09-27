import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FolderKanban, Plus, School, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MediaFrame } from "@/components/ui/media-frame";
import {
  alumniPortfolioEducationLevels,
  alumniPortfolioItemTypes,
  deleteMyAlumniPortfolioItem,
  getMyAlumniPortfolio,
  getMyPortfolioDocumentOptions,
  saveMyAlumniPortfolioItem,
} from "@/features/alumni/portfolio";
import { getMyAlumniEducationHistory } from "@/features/alumni/education-history";

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
const splitTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function AlumniPortfolioPage() {
  const queryClient = useQueryClient();
  const [itemType, setItemType] = useState<(typeof alumniPortfolioItemTypes)[number]>("project");
  const [educationLevel, setEducationLevel] =
    useState<(typeof alumniPortfolioEducationLevels)[number]>("primary");
  const [educationStageId, setEducationStageId] = useState("");
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

  const portfolioQuery = useQuery({
    queryKey: ["alumni", "portfolio", "mine"],
    queryFn: () => getMyAlumniPortfolio(),
  });
  const documentsQuery = useQuery({
    queryKey: ["alumni", "portfolio", "documents"],
    queryFn: () => getMyPortfolioDocumentOptions(),
  });
  const educationQuery = useQuery({
    queryKey: ["alumni", "education", "mine"],
    queryFn: () => getMyAlumniEducationHistory(),
  });
  const stageOptions = (educationQuery.data ?? []).filter(
    (stage) => stage.education_level === educationLevel,
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      saveMyAlumniPortfolioItem({
        data: {
          itemType,
          educationLevel,
          educationStageId: educationStageId || undefined,
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
        },
      }),
    onSuccess: async () => {
      toast.success("Item adicionado ao portfólio.");
      setTitle("");
      setSummary("");
      setOrganization("");
      setRole("");
      setExternalUrl("");
      setImageUrl("");
      setSkills("");
      setTags("");
      setOfficialDocumentRequestId("");
      setEducationStageId("");
      setFeatured(false);
      await queryClient.invalidateQueries({ queryKey: ["alumni", "portfolio"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar o portfólio."),
  });
  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteMyAlumniPortfolioItem({ data: { itemId } }),
    onSuccess: async () => {
      toast.success("Item removido do portfólio.");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "portfolio"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o item."),
  });
  const items = portfolioQuery.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          group="Alumni"
          title="Meu Portfólio Alumni"
          description="Organize projectos, prémios, certificados e publicações por nível e por cada instituição onde estudou."
          icon={FolderKanban}
          crumbs={[
            { label: "Início", to: "/" },
            { label: "Portal Alumni", to: "/alumni/portal" },
            { label: "Portfólio" },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild className="rounded-xl h-9 text-xs">
                <Link to="/alumni/portal/portfolio/education">
                  <School className="mr-1.5 size-3.5" />
                  Minhas instituições
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="rounded-xl h-9 text-xs">
                <Link to="/alumni/portal/portfolio/showcase">Ver apresentação</Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="rounded-xl h-9 text-xs">
                <Link to="/alumni/portal">Voltar ao Portal</Link>
              </Button>
            </div>
          }
        />

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="h-fit border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="size-5 text-primary" />
                Adicionar ao portfólio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                id="portfolio-education-level"
                aria-label="Nível de ensino"
                value={educationLevel}
                onChange={(e) => {
                  setEducationLevel(e.target.value as typeof educationLevel);
                  setEducationStageId("");
                }}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {alumniPortfolioEducationLevels.map((level) => (
                  <option key={level} value={level}>
                    {levelLabels[level]}
                  </option>
                ))}
              </select>
              <select
                id="portfolio-education-stage"
                aria-label="Instituição de ensino associada"
                value={educationStageId}
                onChange={(e) => setEducationStageId(e.target.value)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem instituição específica</option>
                {stageOptions.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.institution_name}
                    {stage.course_name ? ` · ${stage.course_name}` : ""}
                  </option>
                ))}
              </select>
              {!stageOptions.length ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Ainda não há instituições registadas neste nível.{" "}
                  <Link
                    to="/alumni/portal/portfolio/education"
                    className="font-semibold text-foreground underline underline-offset-4"
                  >
                    Adicionar instituição
                  </Link>
                </p>
              ) : null}
              <select
                id="portfolio-item-type"
                aria-label="Tipo de evidência"
                value={itemType}
                onChange={(e) => setItemType(e.target.value as typeof itemType)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {alumniPortfolioItemTypes.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type]}
                  </option>
                ))}
              </select>
              <Input
                id="portfolio-title"
                aria-label="Título do projecto ou evidência"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do projecto / evidência"
              />
              <textarea
                id="portfolio-summary"
                aria-label="Descrição breve, impacto ou resultado"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Descrição breve, impacto ou resultado"
                className="min-h-28 w-full rounded-xl border border-input bg-background p-3 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  id="portfolio-organization"
                  aria-label="Organização"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Organização"
                />
                <Input
                  id="portfolio-role"
                  aria-label="Seu papel"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Seu papel"
                />
              </div>
              <Input
                id="portfolio-external-url"
                aria-label="Link do projecto ou evidência"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https:// projecto, artigo, GitHub, vídeo…"
              />
              <Input
                id="portfolio-image-url"
                aria-label="URL de capa ou imagem"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="URL de capa / imagem"
              />
              <Input
                id="portfolio-skills"
                aria-label="Competências, separadas por vírgula"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Competências, separadas por vírgula"
              />
              <Input
                id="portfolio-tags"
                aria-label="Tags, separadas por vírgula"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Tags, separadas por vírgula"
              />
              <select
                id="portfolio-document-request"
                aria-label="Documento oficial associado"
                value={officialDocumentRequestId}
                onChange={(e) => setOfficialDocumentRequestId(e.target.value)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem documento oficial associado</option>
                {(documentsQuery.data ?? []).map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.request_type || "Documento"} · {doc.status}
                  </option>
                ))}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  id="portfolio-visibility"
                  aria-label="Visibilidade do item"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="alumni">Visível à rede Alumni</option>
                  <option value="school">Visível à escola</option>
                  <option value="private">Privado</option>
                </select>
                <label className="flex h-10 items-center gap-2 rounded-xl border border-input px-3 text-sm">
                  <input
                    id="portfolio-featured"
                    aria-label="Destacar item no portfólio"
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                  />
                  Destacar
                </label>
              </div>
              <Button
                className="w-full"
                onClick={() => saveMutation.mutate()}
                disabled={title.trim().length < 2 || saveMutation.isPending}
              >
                <Plus className="mr-2 size-4" />
                {saveMutation.isPending ? "A guardar…" : "Adicionar item"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black">Portfólio</h2>
                <p className="text-sm text-muted-foreground">{items.length} item(ns)</p>
              </div>
              <FolderKanban className="size-5 text-primary" />
            </div>
            {portfolioQuery.isLoading ? (
              <Card>
                <CardContent className="p-8 text-sm text-muted-foreground">
                  A carregar portfólio…
                </CardContent>
              </Card>
            ) : items.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {items.map((item) => (
                  <Card key={item.id} className="overflow-hidden border-border/70 shadow-sm">
                    {item.image_url ? (
                      <MediaFrame
                        src={item.image_url}
                        alt={item.title || "Imagem do portfólio"}
                        ratio="16/9"
                        rounded="rounded-none"
                        className="h-40 w-full"
                      />
                    ) : null}
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                              {item.education_level
                                ? levelLabels[item.education_level]
                                : "Sem nível"}
                            </span>
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                              {typeLabels[item.item_type] || item.item_type}
                            </span>
                            {item.featured ? (
                              <span className="inline-flex items-center rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-bold">
                                <Star className="mr-1 size-3" />
                                Destaque
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 font-bold">{item.title}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.alumni_education_stages?.institution_name ||
                              [item.role, item.organization].filter(Boolean).join(" · ") ||
                              "Portfólio Alumni"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover item do portfólio"
                          onClick={() => deleteMutation.mutate(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {item.summary ? (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {item.summary}
                        </p>
                      ) : null}
                      {item.skills?.length ? (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {item.skills.map((skill: string) => (
                            <span
                              key={skill}
                              className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                        {item.external_url ? (
                          <a
                            href={item.external_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-xs font-semibold text-primary"
                          >
                            Abrir evidência <ExternalLink className="ml-1 size-3" />
                          </a>
                        ) : null}
                        {item.document_requests ? (
                          <span className="text-xs text-muted-foreground">
                            Documento SIGA: {item.document_requests.request_type || "Documento"}
                          </span>
                        ) : null}
                        <span className="ml-auto text-[11px] font-bold text-muted-foreground">
                          {item.visibility}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-10 text-center">
                  <FolderKanban className="mx-auto size-9 text-muted-foreground" />
                  <h3 className="mt-3 font-bold">O seu portfólio ainda está vazio</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Adicione o primeiro projecto, prémio, publicação ou certificado.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
