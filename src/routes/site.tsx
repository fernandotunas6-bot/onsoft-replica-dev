// style-check: route-exempt — website público escolar sem AppShell nem sessão.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, GraduationCap } from "lucide-react";
import type { CSSProperties } from "react";
import type { PublicSchoolSite } from "@/features/school-site/public-server";
import { MediaFrame } from "@/components/ui/media-frame";
import "@/features/school-site/public-style.css";

export const Route = createFileRoute("/site")({
  head: () => ({
    meta: [
      { title: "Website institucional · SIGA Plus" },
      { name: "description", content: "Website institucional de uma escola SIGA Plus." },
      { name: "robots", content: "noindex,follow" }, // SEO por escola: fase seguinte
    ],
    // Mesmas famílias da fonte visual ISPAB; carregadas apenas no website público.
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;650;700&family=Manrope:wght@400;500;600;650;700;750;800&display=swap",
      },
    ],
  }),
  component: PublicSchoolSitePage,
});

/** Escolhe texto com contraste mínimo WCAG AA para as cores personalizadas. */
function accentForeground(hex: string): string {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0)
    + 0.0722 * (channels[2] ?? 0);
  return luminance <= 0.179 ? "#ffffff" : "#000000";
}

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
  const hasContact = Boolean(contact && (contact.email || contact.phone || contact.address));
  const colors = {
    "--school-site-accent": content.primaryColor,
    "--school-site-accent-ink": accentForeground(content.primaryColor),
  } as CSSProperties;

  const links = (
    <>
      <a href="#inicio">Início</a>
      {content.about ? <a href="#sobre">A instituição</a> : null}
      {hasContact ? <a href="#contactos">Contactos</a> : null}
      <Link to="/" className="school-site__button">
        Portal escolar <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <div className="school-site" style={colors}>
      <a className="school-site__skip" href="#conteudo">Saltar para o conteúdo</a>
      <div className="school-site__topline">
        <div className="school-site__top-inner school-site__container">
          <span>Instituição de ensino · Angola</span>
          <span>Website institucional</span>
        </div>
      </div>
      <header className="school-site__header">
        <div className="school-site__header-inner school-site__container">
          <a href="#inicio" className="school-site__brand" aria-label={schoolName + " — início"}>
            <span className="school-site__brand-mark">
              <GraduationCap size={23} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="school-site__brand-name">{schoolName}</span>
          </a>
          <nav className="school-site__nav" aria-label="Navegação principal">
            {links}
          </nav>
          <details className="school-site__menu">
            <summary>Menu</summary>
            <nav aria-label="Navegação móvel">
              {links}
            </nav>
          </details>
        </div>
      </header>

      <main id="conteudo">
        <section id="inicio" className="school-site__hero school-site__container">
          <div>
            <div className="school-site__eyebrow">
              <span className="school-site__dot" aria-hidden="true" />
              Conhecimento · Educação · Futuro
            </div>
            <h1 className="school-site__headline">
              {content.title}
              <span className="school-site__headline-accent">.</span>
            </h1>
            {content.tagline ? (
              <p className="school-site__intro">{content.tagline}</p>
            ) : null}
            <div className="school-site__hero-actions">
              <Link to="/" className="school-site__button">
                Aceder ao portal <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              {content.about ? (
                <a className="school-site__text-link" href="#sobre">
                  Conheça a escola <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <div className="school-site__hero-note">
              <span className="school-site__note-icon" aria-hidden="true">✳</span>
              <span>Um espaço institucional com acesso ao portal escolar.</span>
            </div>
          </div>
          <div className="school-site__hero-visual">
            <div className="school-site__paper-grid" aria-hidden="true" />
            {content.heroImageUrl ? (
              <MediaFrame
                src={content.heroImageUrl}
                alt={"Imagem institucional de " + schoolName}
                ratio="3/2"
                className="school-site__photo"
              >
                <div className="school-site__photo-caption">
                  <span>{schoolName}</span>
                  <ArrowUpRight size={21} aria-hidden="true" />
                </div>
              </MediaFrame>
            ) : (
              <div className="school-site__photo school-site__photo-fallback" aria-hidden="true">
                <span>{schoolName}</span>
                <div className="school-site__photo-caption">
                  <span>A nossa instituição</span>
                  <ArrowUpRight size={21} />
                </div>
              </div>
            )}
            <div className="school-site__float" aria-hidden="true">
              <span className="school-site__float-icon">✳</span>
              <span>Um lugar para<br /><strong>aprender e crescer.</strong></span>
            </div>
            <div className="school-site__badge" aria-hidden="true">
              Portal escolar integrado
            </div>
          </div>
        </section>

        {content.about ? (
          <section id="sobre" aria-labelledby="titulo-sobre" className="school-site__section school-site__section-soft">
            <div className="school-site__container">
              <div className="school-site__section-head">
                <span className="school-site__eyebrow">A nossa identidade</span>
                <h2 id="titulo-sobre">Conheça a nossa instituição</h2>
                <p>{content.about}</p>
              </div>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="titulo-servicos" className="school-site__section">
          <div className="school-site__container">
            <div className="school-site__section-head">
              <span className="school-site__eyebrow">Serviços institucionais</span>
              <h2 id="titulo-servicos">A sua escola, sempre por perto.</h2>
              <p>Aceda ao ambiente escolar ou consulte as informações que a instituição disponibiliza.</p>
            </div>
            <div className="school-site__services">
              <Link to="/" className="school-site__service">
                <GraduationCap size={27} color={content.primaryColor} aria-hidden="true" />
                <h3>Portal escolar</h3>
                <p>Entre no ambiente académico e administrativo com as suas credenciais SIGA.</p>
                <span>Entrar no portal ↗</span>
              </Link>
              <a className="school-site__service" href={content.about ? "#sobre" : "#inicio"}>
                <span className="school-site__note-icon" aria-hidden="true">✳</span>
                <h3>Identidade institucional</h3>
                <p>Conheça a escola e a sua presença institucional online.</p>
                <span>Conhecer a instituição ↗</span>
              </a>
            </div>
          </div>
        </section>

        {hasContact && contact ? (
          <section id="contactos" aria-labelledby="titulo-contactos" className="school-site__section school-site__section-soft">
            <div className="school-site__container school-site__contacts">
              <div className="school-site__section-head">
                <span className="school-site__eyebrow">Estamos por perto</span>
                <h2 id="titulo-contactos">Entre em contacto.</h2>
                <p>Utilize os contactos oficiais publicados pela instituição.</p>
              </div>
              <address>
                {contact.address ? <p><strong>Morada</strong><br />{contact.address}</p> : null}
                {contact.phone ? <p><strong>Telefone</strong><br />{contact.phone}</p> : null}
                {contact.email ? <p><strong>E-mail</strong><br />{contact.email}</p> : null}
              </address>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="school-site__footer">
        <div className="school-site__container school-site__footer-main">
          <div>
            <p className="school-site__brand">
              <span className="school-site__brand-mark">
                <GraduationCap size={23} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="school-site__brand-name">{schoolName}</span>
            </p>
            <p>Website institucional da escola. O portal académico mantém o seu acesso protegido.</p>
          </div>
          <Link to="/" className="school-site__text-link">
            Entrar no Portal Escolar <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="school-site__footer-bottom">
          <div className="school-site__container">
            {schoolName} · Website institucional gerido no SIGA Plus
          </div>
        </div>
      </footer>
    </div>
  );
}
