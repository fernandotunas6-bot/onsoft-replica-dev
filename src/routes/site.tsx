// style-check: route-exempt — website público escolar sem AppShell nem sessão.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PublicSchoolSite } from "@/features/school-site/public-server";
import { MediaFrame } from "@/components/ui/media-frame";

export const Route = createFileRoute("/site")({
  head: () => ({
    meta: [
      { title: "Website institucional · SIGA Plus" },
      { name: "description", content: "Website institucional de uma escola SIGA Plus." },
      { name: "robots", content: "noindex,follow" }, // SEO específico por escola: fase seguinte
    ],
  }),
  component: PublicSchoolSitePage,
});

function PublicSchoolSitePage() {
  const site = useQuery({
    queryKey: ["public-school-site", "current-host"],
    enabled: typeof window !== "undefined",
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<PublicSchoolSite> => {
      const response = await fetch("/api/public/school-site", { credentials: "omit" });
      if (!response.ok) throw new Error("Website indisponível.");
      const json = (await response.json()) as { site: PublicSchoolSite };
      return json.site;
    },
  });

  if (site.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-5">
        <p className="text-sm text-muted-foreground">A carregar o website institucional…</p>
      </main>
    );
  }
  if (site.isError || !site.data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-5 text-center">
        <h1 className="text-xl font-semibold">Website ainda não publicado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta instituição ainda não disponibilizou o seu website público ou o serviço está
          indisponível.
        </p>
        <Link to="/" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
          Ir para o Portal Escolar
        </Link>
      </main>
    );
  }
  const { content, contact, schoolName } = site.data;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav
          aria-label="Navegação principal"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4"
        >
          <span className="text-base font-semibold">{schoolName}</span>
          <Link
            to="/"
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Entrar no Portal
          </Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-16 md:grid-cols-2 md:py-24">
          <div className="space-y-6">
            <p
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: content.primaryColor }}
            >
              Instituição de ensino
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight md:text-5xl">
              {content.title}
            </h1>
            {content.tagline ? (
              <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                {content.tagline}
              </p>
            ) : null}
            <Link
              to="/"
              className="inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Aceder ao Portal Escolar
            </Link>
          </div>
          {content.heroImageUrl ? (
            <MediaFrame
              src={content.heroImageUrl}
              alt={"Instalações de " + schoolName}
              ratio="3/2"
              className="w-full"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex aspect-[3/2] items-center justify-center rounded-2xl bg-muted"
            >
              <span className="text-3xl font-semibold text-muted-foreground">{schoolName}</span>
            </div>
          )}
        </section>
        {content.about ? (
          <section aria-labelledby="sobre-escola" className="border-t bg-muted/20 px-5 py-16">
            <div className="mx-auto max-w-4xl space-y-4">
              <h2 id="sobre-escola" className="text-2xl font-semibold">
                Sobre a nossa escola
              </h2>
              <p className="whitespace-pre-line leading-8 text-muted-foreground">{content.about}</p>
            </div>
          </section>
        ) : null}
        {contact && (contact.email || contact.phone || contact.address) ? (
          <section
            aria-labelledby="contactos-escola"
            className="mx-auto max-w-4xl space-y-5 px-5 py-16"
          >
            <h2 id="contactos-escola" className="text-2xl font-semibold">
              Contactos
            </h2>
            <address className="space-y-2 not-italic text-sm text-muted-foreground">
              {contact.address ? <p>{contact.address}</p> : null}
              {contact.phone ? <p>Telefone: {contact.phone}</p> : null}
              {contact.email ? <p>E-mail: {contact.email}</p> : null}
            </address>
          </section>
        ) : null}
      </main>
      <footer className="border-t px-5 py-8 text-center text-xs text-muted-foreground">
        {schoolName} · Website institucional no SIGA Plus
      </footer>
    </div>
  );
}
