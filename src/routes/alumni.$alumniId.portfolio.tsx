import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, FolderKanban, Star } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MediaAvatar } from "@/components/ui/media-frame";
import { getAlumniProfile } from "@/features/alumni/server";
import { listAlumniPortfolioAdmin, setAlumniPortfolioFeatured } from "@/features/alumni/portfolio";

export const Route = createFileRoute("/alumni/$alumniId/portfolio")({
  head: () => ({ meta: [{ title: "Portfólio Alumni 360º · SIGA" }] }),
  component: AlumniPortfolio360Page,
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

function AlumniPortfolio360Page() {
  const { alumniId } = Route.useParams();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["alumni", "profile", alumniId],
    queryFn: () => getAlumniProfile({ data: { alumniId } }),
  });
  const portfolioQuery = useQuery({
    queryKey: ["alumni", "portfolio", "admin", alumniId],
    queryFn: () => listAlumniPortfolioAdmin({ data: { alumniId } }),
  });

  const featuredMutation = useMutation({
    mutationFn: ({ itemId, featured }: { itemId: string; featured: boolean }) =>
      setAlumniPortfolioFeatured({ data: { itemId, featured } }),
    onSuccess: async () => {
      toast.success("Destaque do portfólio actualizado.");
      await queryClient.invalidateQueries({ queryKey: ["alumni", "portfolio", "admin", alumniId] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível actualizar o destaque.",
      ),
  });

  if (profileQuery.isLoading || portfolioQuery.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-6 text-sm text-muted-foreground">
          A carregar Portfólio Alumni 360º…
        </div>
      </AppShell>
    );
  }
  if (!profileQuery.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-6 text-sm text-destructive">
          Não foi possível carregar este Alumni.
        </div>
      </AppShell>
    );
  }

  const profile = profileQuery.data.profile as Record<string, any>;
  const person = (profileQuery.data.person ?? {}) as Record<string, any>;
  const items = portfolioQuery.data ?? [];
  const visible = items.filter((item: any) => item.visibility !== "private");
  const privateItems = items.filter((item: any) => item.visibility === "private");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1450px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link to="/alumni/$alumniId" params={{ alumniId }}>
              <ArrowLeft className="mr-2 size-4" />
              Ficha Alumni 360º
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/alumni/documents">
              <FileText className="mr-2 size-4" />
              Documentos Alumni
            </Link>
          </Button>
        </div>

        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <MediaAvatar
              src={person.photo_url ?? null}
              alt={person.full_name ?? "Alumni"}
              className="size-20 rounded-[24px] object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <FolderKanban className="size-3.5" /> Portfólio Alumni 360º
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight">
                {person.full_name ?? "Alumni"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile.headline ||
                  profile.current_role ||
                  "Identidade profissional e evidências pós-formação"}
              </p>
            </div>
            <div className="grid min-w-52 grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-muted/60 p-3">
                <p className="text-2xl font-black">{items.length}</p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Itens</p>
              </div>
              <div className="rounded-2xl bg-muted/60 p-3">
                <p className="text-2xl font-black">
                  {items.filter((item: any) => item.featured).length}
                </p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Destaques</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-black">Portfólio visível</h2>
            <p className="text-sm text-muted-foreground">
              Itens que podem ser apresentados à escola ou à rede Alumni, conforme a visibilidade
              definida.
            </p>
          </div>
          {visible.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((item: any) => (
                <PortfolioAdminCard
                  key={item.id}
                  item={item}
                  onToggleFeatured={() =>
                    featuredMutation.mutate({ itemId: item.id, featured: !item.featured })
                  }
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-sm text-muted-foreground">
                Ainda não existem itens visíveis neste portfólio.
              </CardContent>
            </Card>
          )}
        </section>

        {privateItems.length ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-black">Itens privados</h2>
              <p className="text-sm text-muted-foreground">
                Visíveis apenas no contexto administrativo autorizado; não devem ser publicados
                automaticamente.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {privateItems.map((item: any) => (
                <PortfolioAdminCard
                  key={item.id}
                  item={item}
                  onToggleFeatured={() =>
                    featuredMutation.mutate({ itemId: item.id, featured: !item.featured })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function PortfolioAdminCard({
  item,
  onToggleFeatured,
}: {
  item: any;
  onToggleFeatured: () => void;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      {item.image_url ? (
        <img src={item.image_url} alt="" className="h-40 w-full object-cover" />
      ) : null}
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase text-primary">
              {typeLabels[item.item_type] || item.item_type}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase">
              {item.visibility}
            </span>
          </div>
          <Button
            variant={item.featured ? "default" : "outline"}
            size="icon"
            onClick={onToggleFeatured}
            title={item.featured ? "Remover destaque" : "Destacar"}
          >
            <Star className="size-4" />
          </Button>
        </div>
        <h3 className="mt-3 font-black">{item.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {[item.role, item.organization].filter(Boolean).join(" · ") || "Portfólio Alumni"}
        </p>
        {item.summary ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.summary}</p>
        ) : null}
        {item.skills?.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {item.skills.map((skill: string) => (
              <span
                key={skill}
                className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
          {item.external_url ? (
            <a
              href={item.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs font-bold text-primary"
            >
              Abrir evidência <ExternalLink className="ml-1 size-3" />
            </a>
          ) : null}
          {item.document_requests ? (
            <span className="text-xs text-muted-foreground">Documento SIGA vinculado</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
