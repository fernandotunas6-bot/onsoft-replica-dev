import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  MapPin,
  Printer,
  Star,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MediaAvatar } from "@/components/ui/media-frame";
import { getMyAlumniPortal } from "@/features/alumni/self-service";
import { getMyAlumniPortfolio } from "@/features/alumni/portfolio";

export const Route = createFileRoute("/alumni/portal/portfolio/print")({
  head: () => ({
    meta: [
      { title: "Portfólio Profissional Alumni · SIGA" },
      { name: "description", content: "Vista profissional e imprimível do portfólio Alumni." },
    ],
  }),
  component: AlumniPortfolioPrintPage,
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

function AlumniPortfolioPrintPage() {
  const portalQuery = useQuery({
    queryKey: ["alumni", "portfolio", "print", "profile"],
    queryFn: () => getMyAlumniPortal(),
  });
  const portfolioQuery = useQuery({
    queryKey: ["alumni", "portfolio", "print", "items"],
    queryFn: () => getMyAlumniPortfolio(),
  });

  if (portalQuery.isLoading || portfolioQuery.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl p-8 text-sm text-muted-foreground">
          A preparar portfólio profissional…
        </div>
      </AppShell>
    );
  }

  const portal = portalQuery.data;
  if (!portal) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl p-8 text-sm text-destructive">
          O Portal Alumni ainda não está activado.
        </div>
      </AppShell>
    );
  }

  const items = portfolioQuery.data ?? [];
  const publicItems = items.filter((item: any) => item.visibility !== "private");
  const featured = publicItems.filter((item: any) => item.featured);
  const remaining = publicItems.filter((item: any) => !item.featured);
  const profile = portal.profile as Record<string, any>;
  const person = (portal.person ?? {}) as Record<string, any>;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" asChild>
            <Link to="/alumni/portal/portfolio">
              <ArrowLeft className="mr-2 size-4" />
              Editar portfólio
            </Link>
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 size-4" />
            Imprimir / Guardar PDF
          </Button>
        </div>

        <article className="overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <header className="border-b border-border/60 p-7 md:p-10 print:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <MediaAvatar
                src={person.photo_url ?? null}
                alt={person.full_name ?? "Alumni"}
                className="size-24 rounded-[26px] object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                  SIGA · Alumni Portfolio
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
                  {person.full_name ?? "Alumni"}
                </h1>
                <p className="mt-2 text-base font-semibold text-muted-foreground">
                  {profile.headline || profile.current_role || "Perfil profissional Alumni"}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  {profile.current_company ? (
                    <span className="inline-flex items-center gap-1.5">
                      <BriefcaseBusiness className="size-3.5" />
                      {profile.current_role ? `${profile.current_role} · ` : ""}
                      {profile.current_company}
                    </span>
                  ) : null}
                  {profile.graduation_year ? (
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="size-3.5" />
                      Conclusão {profile.graduation_year}
                      {profile.graduation_course ? ` · ${profile.graduation_course}` : ""}
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
            </div>
            {profile.biography ? (
              <p className="mt-6 max-w-4xl text-sm leading-7 text-muted-foreground">
                {profile.biography}
              </p>
            ) : null}
            {profile.skills?.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {profile.skills.map((skill: string) => (
                  <span
                    key={skill}
                    className="rounded-full bg-muted px-3 py-1 text-xs font-semibold"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </header>

          <div className="space-y-8 p-7 md:p-10 print:p-8">
            {featured.length ? (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Star className="size-5 text-primary" />
                  <h2 className="text-xl font-black">Trabalhos em destaque</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {featured.map((item: any) => (
                    <PortfolioCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-4 flex items-center gap-2">
                <FolderKanban className="size-5 text-primary" />
                <h2 className="text-xl font-black">Portfólio</h2>
              </div>
              {remaining.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {remaining.map((item: any) => (
                    <PortfolioCard key={item.id} item={item} />
                  ))}
                </div>
              ) : !featured.length ? (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-sm text-muted-foreground">
                    Ainda não existem itens visíveis no portfólio.
                  </CardContent>
                </Card>
              ) : null}
            </section>

            {portal.experiences?.length ? (
              <section>
                <h2 className="mb-4 text-xl font-black">Experiência</h2>
                <div className="space-y-3">
                  {portal.experiences.map((item: any) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-border/60 p-4 break-inside-avoid"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold">{item.title || item.kind}</p>
                          <p className="text-sm text-muted-foreground">
                            {[item.organization, item.location].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {item.is_current ? (
                          <span className="text-[10px] font-black uppercase text-primary">
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
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <footer className="border-t border-border/60 px-7 py-5 text-xs text-muted-foreground md:px-10 print:px-8">
            Portfólio profissional gerado a partir do perfil Alumni no SIGA. Documentos escolares
            oficiais permanecem nos registos institucionais do módulo Documentos.
          </footer>
        </article>
      </div>
    </AppShell>
  );
}

function PortfolioCard({ item }: { item: any }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 break-inside-avoid">
      {item.image_url ? (
        <img src={item.image_url} alt="" className="h-40 w-full object-cover print:h-32" />
      ) : null}
      <div className="p-5">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase text-primary">
            {typeLabels[item.item_type] || item.item_type}
          </span>
          {item.document_requests ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold">
              Documento SIGA
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 font-black">{item.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {[item.role, item.organization].filter(Boolean).join(" · ")}
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
        {item.external_url ? (
          <a
            href={item.external_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center text-xs font-bold text-primary print:hidden"
          >
            Abrir evidência <ExternalLink className="ml-1 size-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
