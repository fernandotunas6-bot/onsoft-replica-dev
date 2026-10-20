// style-check: route-exempt — gestão do website, separada das restantes definições.
import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  getSchoolSiteEditor,
  saveSchoolSiteDraft,
  publishSchoolSite,
} from "@/features/school-site/editor-server";
import type { SchoolSiteContent } from "@/features/school-site/schema";

export const Route = createFileRoute("/configuracoes_/site")({
  head: () => ({ meta: [{ title: "Website da escola · SIGA Plus" }] }),
  component: SchoolSiteEditorPage,
});

const QUERY_KEY = ["school", "website-editor"] as const;

function SchoolSiteEditorPage() {
  const account = useCurrentAccount();
  const isAdmin = account.roles.includes("Administrador");
  const schoolId = account.schoolId;
  const queryKey = [...QUERY_KEY, account.id, schoolId ?? "none"] as const;
  const [draft, setDraft] = useState<SchoolSiteContent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const client = useQueryClient();
  // Trocar de escola/conta não pode reutilizar o rascunho da anterior.
  useEffect(() => {
    setDraft(null);
    setNotice(null);
  }, [account.id, schoolId]);
  const load = useServerFn(getSchoolSiteEditor);
  const save = useServerFn(saveSchoolSiteDraft);
  const publish = useServerFn(publishSchoolSite);
  const query = useQuery({
    queryKey,
    enabled: isAdmin && Boolean(schoolId),
    queryFn: () => load(),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const current = draft ?? query.data?.settings.draft ?? null;
  const dirty = Boolean(
    draft && query.data && JSON.stringify(draft) !== JSON.stringify(query.data.settings.draft),
  );
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!query.data || !current) throw new Error("Website ainda não carregado.");
      return save({ data: { expectedVersion: query.data.version, draft: current } });
    },
    onSuccess: async () => {
      setDraft(null);
      setNotice("Rascunho guardado. Ainda não foi publicado.");
      await client.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Não foi possível guardar."),
  });
  const publishMutation = useMutation({
    mutationFn: () => {
      if (!query.data || dirty) throw new Error("Guarde as alterações antes de publicar.");
      return publish({ data: { expectedVersion: query.data.version } });
    },
    onSuccess: async () => {
      setNotice("Website publicado. Verifique a página pública.");
      await client.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Não foi possível publicar."),
  });

  const change = <K extends keyof SchoolSiteContent>(key: K, value: SchoolSiteContent[K]) => {
    if (!current) return;
    setDraft({ ...current, [key]: value });
    setNotice(null);
  };

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    saveMutation.mutate();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Instituição"
          title="Website da escola"
          description="Personalize, guarde e publique o website institucional da sua escola."
        />
        {!account.profile.isLoading && !isAdmin ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              Só o Administrador da escola pode gerir este website.
            </p>
          </Panel>
        ) : query.isLoading ? (
          <Panel title="A carregar">A consultar as definições do website…</Panel>
        ) : query.isError || !query.data || !current ? (
          <Panel title="Não foi possível carregar">
            <p className="text-sm text-muted-foreground">Verifique a sessão e tente novamente.</p>
          </Panel>
        ) : (
          <>
            <Panel title="Publicação">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {query.data.settings.publishedAt
                    ? "Publicado: " +
                      new Date(query.data.settings.publishedAt).toLocaleString("pt-AO")
                    : "Ainda não publicado. O Portal Escolar continua disponível."}
                </p>
                <Link to="/site" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                  Ver website
                </Link>
              </div>
            </Panel>
            <form onSubmit={onSave} className="space-y-5">
              <Panel title="Identidade e conteúdo">
                <div className="grid gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="site-title">Título da página</Label>
                    <Input
                      id="site-title"
                      value={current.title}
                      maxLength={120}
                      required
                      onChange={(event) => change("title", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="site-tagline">Mensagem de boas-vindas</Label>
                    <Textarea
                      id="site-tagline"
                      value={current.tagline}
                      maxLength={240}
                      onChange={(event) => change("tagline", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="site-about">Sobre a instituição</Label>
                    <Textarea
                      id="site-about"
                      value={current.about}
                      maxLength={3000}
                      rows={6}
                      onChange={(event) => change("about", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="site-image">Imagem de capa (HTTPS)</Label>
                      <Input
                        id="site-image"
                        inputMode="url"
                        type="url"
                        value={current.heroImageUrl ?? ""}
                        placeholder="https://..."
                        onChange={(event) => change("heroImageUrl", event.target.value || null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="site-color">Cor institucional</Label>
                      <Input
                        id="site-color"
                        type="color"
                        value={current.primaryColor}
                        onChange={(event) => change("primaryColor", event.target.value)}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      id="site-show-contact"
                      type="checkbox"
                      aria-label="Mostrar contactos institucionais"
                      checked={current.showContact}
                      onChange={(event) => change("showContact", event.target.checked)}
                      className="size-4 accent-primary"
                    />
                    Mostrar contactos institucionais no website
                  </label>
                </div>
              </Panel>
              {notice ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={!dirty || saveMutation.isPending || publishMutation.isPending}
                >
                  {saveMutation.isPending ? "A guardar…" : "Guardar rascunho"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    dirty ||
                    !query.data.version ||
                    saveMutation.isPending ||
                    publishMutation.isPending
                  }
                  onClick={() => {
                    setNotice(null);
                    publishMutation.mutate();
                  }}
                >
                  {publishMutation.isPending ? "A publicar…" : "Publicar website"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Só as alterações publicadas aparecem para visitantes. Para entrar no SIGA, use o
                portal habitual.
              </p>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
