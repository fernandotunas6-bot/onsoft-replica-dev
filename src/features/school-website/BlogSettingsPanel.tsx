import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { changeSchoolBlog, listSchoolBlog } from "./blog-server";
import { type SchoolBlogDraft, type SchoolBlogState } from "./blog-model";
import { useDraftUnloadWarning } from "./use-draft-unload-warning";

const emptyDraft: SchoolBlogDraft = {
  title: "",
  excerpt: "",
  body: "",
  category: "Novidades",
  coverUrl: "",
  coverAlt: "",
  authorName: "",
};
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
export function BlogSettingsPanel() {
  const { school } = useSchoolSettings();
  return <BlogEditor key={school?.id} schoolId={school?.id} />;
}
function BlogEditor({ schoolId }: { schoolId?: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["school-blog", schoolId, page],
    enabled: Boolean(schoolId),
    queryFn: () => listSchoolBlog({ data: { page } }),
    retry: false,
  });
  const [selected, setSelected] = useState<SchoolBlogState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SchoolBlogDraft>(emptyDraft);
  const [slug, setSlug] = useState("");
  const [customSlug, setCustomSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty =
    editing &&
    (slug !== (selected?.slug ?? "") ||
      JSON.stringify(draft) !== JSON.stringify(selected?.draft ?? emptyDraft));
  useDraftUnloadWarning(dirty);
  function open(post: SchoolBlogState | null) {
    if (!confirmDiscardChanges(dirty)) return;
    setSelected(post);
    setDraft(post?.draft ?? { ...emptyDraft });
    setSlug(post?.slug ?? "");
    setEditing(true);
    setCustomSlug(false);
    setError("");
    setMessage("");
  }
  async function act(action: "save" | "publish" | "unpublish" | "archive" | "restore") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await changeSchoolBlog({
        data: {
          slug,
          expectedRevision: selected?.revision ?? 0,
          action,
          ...(["save", "publish"].includes(action) ? { draft } : {}),
        },
      });
      setSelected(next);
      // Status actions do not save content: retain any edits still waiting to be saved.
      if (action === "save" || action === "publish") setDraft(next.draft);
      setSlug(next.slug);
      setMessage(
        {
          save: "Rascunho guardado. A publicação mantém-se inalterada.",
          publish: "Artigo publicado no blog da escola.",
          unpublish: "Artigo retirado do blog público.",
          archive: "Artigo arquivado e retirado do blog público.",
          restore: "Artigo restaurado como rascunho. Publique quando estiver pronto.",
        }[action],
      );
      await client.invalidateQueries({ queryKey: ["school-blog", schoolId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível guardar o artigo.");
    } finally {
      setBusy(false);
    }
  }
  const clearFeedback = () => {
    setMessage("");
    setError("");
  };
  const update = (field: keyof SchoolBlogDraft, value: string) => {
    clearFeedback();
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const loadError = query.isError ? (
    <div role="alert" className="space-y-3">
      <p>{query.error.message}</p>
      <Button variant="outline" onClick={() => query.refetch()}>
        Tentar novamente
      </Button>
    </div>
  ) : null;
  if (loadError && !editing && !query.data) return loadError;
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Blog da escola</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Publique notícias, actividades e artigos no website da sua instituição.
          </p>
        </div>
        <Button disabled={busy} onClick={() => open(null)}>
          Novo artigo
        </Button>
      </div>
      {loadError}
      {message && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {query.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          A carregar os artigos…
        </p>
      )}
      {!editing && query.data?.posts.length === 0 && (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          Ainda não existem artigos. Crie o primeiro e guarde-o como rascunho ou publique-o.
        </p>
      )}
      {!editing && (
        <div className="space-y-2">
          {query.data?.posts.map((post) => (
            <button
              key={post.slug}
              type="button"
              className="block w-full rounded-xl border border-border p-3 text-left hover:bg-secondary/40"
              onClick={() => open(post)}
            >
              <span className="block break-words text-sm font-medium">{post.draft.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {post.archived ? "Arquivado" : post.isPublished ? "Publicado" : "Rascunho"} · /blog/
                {post.slug}/
              </span>
            </button>
          ))}
        </div>
      )}
      {!editing && Boolean(query.data && query.data.total > 20) && (
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-xs">Página {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * 20 >= (query.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Seguinte
          </Button>
        </div>
      )}
      {editing && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void act("save");
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (confirmDiscardChanges(dirty)) setEditing(false);
            }}
          >
            Voltar à lista
          </Button>
          <fieldset disabled={busy} className="space-y-4">
            <legend className="sr-only">Editar artigo</legend>
            <div className="space-y-2">
              <Label htmlFor="school-blog-title">Título</Label>
              <Input
                id="school-blog-title"
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => {
                  update("title", e.target.value);
                  if (!selected && !customSlug) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-blog-slug">Endereço do artigo</Label>
              <Input
                id="school-blog-slug"
                required
                maxLength={100}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                disabled={Boolean(selected)}
                onChange={(e) => {
                  clearFeedback();
                  setCustomSlug(true);
                  setSlug(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Use letras minúsculas, números e hífens. O endereço fica fixo após a primeira
                gravação para preservar os links.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="school-blog-category">Categoria</Label>
                <Input
                  id="school-blog-category"
                  maxLength={60}
                  value={draft.category}
                  onChange={(e) => update("category", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school-blog-author">Assinatura pública (opcional)</Label>
                <Input
                  id="school-blog-author"
                  maxLength={120}
                  value={draft.authorName}
                  onChange={(e) => update("authorName", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-blog-excerpt">Resumo</Label>
              <Textarea
                id="school-blog-excerpt"
                maxLength={400}
                rows={3}
                value={draft.excerpt}
                onChange={(e) => update("excerpt", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-blog-body">Texto do artigo</Label>
              <Textarea
                id="school-blog-body"
                maxLength={60000}
                rows={12}
                value={draft.body}
                onChange={(e) => update("body", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Escreva em texto simples e separe os parágrafos com uma linha em branco. O resumo e
                o texto são obrigatórios para publicar.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-blog-cover">Imagem de capa (URL HTTPS, opcional)</Label>
              <Input
                id="school-blog-cover"
                type="url"
                value={draft.coverUrl}
                onChange={(e) => update("coverUrl", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-blog-alt">Descrição da imagem</Label>
              <Input
                id="school-blog-alt"
                maxLength={250}
                value={draft.coverAlt}
                onChange={(e) => update("coverAlt", e.target.value)}
              />
            </div>
          </fieldset>
          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-3">
            <Button disabled={busy} variant="outline" type="submit">
              {busy ? "A guardar…" : "Guardar rascunho"}
            </Button>
            <Button disabled={busy} type="button" onClick={() => act("publish")}>
              Publicar artigo
            </Button>
          </div>
          {selected && (
            <div className="flex flex-wrap gap-2">
              {selected.isPublished && (
                <Button
                  disabled={busy}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => act("unpublish")}
                >
                  Retirar publicação
                </Button>
              )}
              <Button
                disabled={busy}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => act(selected.archived ? "restore" : "archive")}
              >
                {selected.archived ? "Restaurar artigo" : "Arquivar artigo"}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
