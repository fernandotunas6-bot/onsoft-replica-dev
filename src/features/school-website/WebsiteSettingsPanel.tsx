import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaFrame } from "@/components/ui/media-frame";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { actionIcons } from "@/lib/app-icons";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { changeSchoolWebsite, getSchoolWebsiteEditor } from "./content-server";
import { useDraftUnloadWarning } from "./use-draft-unload-warning";
import {
  safePublicUrl,
  websiteTemplate,
  type WebsiteDraft,
  type WebsiteState,
} from "./content-model";

const Copy = actionIcons.copy;
const External = actionIcons.external;
function previewImage(value: string, websiteUrl: string) {
  try {
    const url = new URL(value, websiteUrl || undefined);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function WebsiteSettingsPanel() {
  const { school } = useSchoolSettings();
  // Remount on school changes: never retain one school's draft in another school's editor.
  return <WebsiteEditor key={school?.id ?? "loading"} schoolId={school?.id} />;
}
function WebsiteEditor({ schoolId }: { schoolId?: string }) {
  const query = useQuery({
    queryKey: ["school-website", schoolId],
    queryFn: () => getSchoolWebsiteEditor(),
    enabled: Boolean(schoolId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [state, setState] = useState<WebsiteState | null>(null);
  const [draft, setDraft] = useState<WebsiteDraft | null>(null);
  const [group, setGroup] = useState("Navegação");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (query.data && !state) {
      setState(query.data.state);
      setDraft(query.data.state.draft);
    }
  }, [query.data, state]);
  const dirty = Boolean(state && draft && JSON.stringify(state.draft) !== JSON.stringify(draft));
  useDraftUnloadWarning(dirty);
  const groups = useMemo(
    () => [...new Set(websiteTemplate.fields.map((field) => field.group))],
    [],
  );
  const filtered = useMemo(
    () =>
      websiteTemplate.fields.filter(
        (field) =>
          field.group === group &&
          (!search ||
            `${field.label} ${draft?.values[field.key] ?? field.value}`
              .toLocaleLowerCase("pt")
              .includes(search.toLocaleLowerCase("pt"))),
      ),
    [draft, group, search],
  );
  const changeValue = (key: string, value: string) => {
    setMessage("");
    setError("");
    setDraft((current) =>
      current ? { ...current, values: { ...current.values, [key]: value } } : current,
    );
  };
  const changeDraft = (next: WebsiteDraft) => {
    setMessage("");
    setError("");
    setDraft(next);
  };
  const navigate = (panel: string) => {
    if (!busy && confirmDiscardChanges(dirty)) openSettingsPanel(panel);
  };
  async function act(action: "save" | "publish" | "restore" | "unpublish") {
    if (!state || !draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await changeSchoolWebsite({
        data: {
          expectedRevision: state.revision,
          action,
          ...(["save", "publish"].includes(action) ? { draft } : {}),
        },
      });
      setState(next);
      // Withdrawing a publication must not overwrite a local, unsaved draft.
      if (action !== "unpublish") setDraft(next.draft);
      setMessage(
        {
          save: "Rascunho guardado. O site mantém a versão publicada.",
          publish: "Conteúdo publicado. O site irá recebê-lo na próxima abertura da página.",
          restore: "A versão publicada foi reposta no rascunho.",
          unpublish: "Publicação retirada. O site deixa de receber os conteúdos pela API.",
        }[action],
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível guardar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const endpoint =
    query.data && typeof window !== "undefined"
      ? `${window.location.origin}/api/public/school-content/${encodeURIComponent(query.data.school.public_code)}`
      : "";
  async function copyConfiguration() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            portalUrl: query.data?.links?.portalUrl ?? window.location.origin + "/portal",
            storageId: query.data?.school.public_code,
            schoolName: query.data?.school.name,
            contentUrl: endpoint,
            blogUrl: endpoint.replace("/school-content/", "/school-blog/"),
          },
          null,
          2,
        ),
      );
      setMessage(
        "Configuração copiada. Guarde-a em school-runtime.json na raiz do website, uma única vez.",
      );
    } catch {
      setError("Não foi possível copiar. Utilize o endereço da API indicado abaixo.");
    }
  }
  const loadError = query.isError ? (
    <div role="alert" className="space-y-3">
      <p>{query.error.message}</p>
      <Button variant="outline" onClick={() => query.refetch()}>
        Tentar novamente
      </Button>
    </div>
  ) : null;
  if (loadError && (!state || !draft)) return loadError;
  if (!draft || !state)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        A carregar os conteúdos do website…
      </p>
    );
  const templateMismatch = draft.templateVersion !== websiteTemplate.version;
  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
        <h3 className="font-semibold">Website da {query.data?.school.name}</h3>
        <p className="text-sm text-muted-foreground">
          Edite as páginas públicas existentes sem alterar o desenho do site. A autenticação e os
          dados académicos continuam no SIGA Plus.
        </p>
        <p className="text-xs text-muted-foreground">
          {state.published
            ? `Publicado em ${new Date(state.published.publishedAt).toLocaleString("pt-AO")} · versão ${state.published.revision}`
            : "Ainda sem publicação pela API."}{" "}
          {dirty ? "Tem alterações por guardar." : "Rascunho guardado."}
        </p>
      </div>
      {query.data?.links && (
        <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
          <h4 className="font-medium">Endereços da escola</h4>
          <p className="text-muted-foreground">
            O website utiliza o subdomínio atribuído à escola ou o domínio próprio já verificado. A
            identidade é carregada automaticamente.
          </p>
          <a
            className="block break-all text-primary underline"
            href={query.data.links.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {query.data.links.websiteUrl}
          </a>
          <p className="text-xs text-muted-foreground">Endereço alternativo na plataforma:</p>
          <a
            className="block break-all text-primary underline"
            href={query.data.links.fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {query.data.links.fallbackUrl}
          </a>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => navigate("identidade")}
            >
              Gerir domínio próprio
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => navigate("website.blog")}
            >
              Administrar blog
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Domínios próprios só são usados após verificação e encaminhamento DNS/HTTPS para a
            plataforma. O blog acompanha os mesmos endereços.
          </p>
        </div>
      )}
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
      {templateMismatch && (
        <p role="alert" className="text-sm text-destructive">
          O modelo foi actualizado. É necessário compatibilizar os campos do rascunho antes de
          publicar. Os conteúdos anteriores permanecem guardados.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="website-origin">Domínio para hospedagem externa (opcional)</Label>
        <Input
          id="website-origin"
          type="url"
          placeholder="https://www.instituicao.ao"
          value={draft.websiteUrl}
          disabled={busy}
          onChange={(e) => changeDraft({ ...draft, websiteUrl: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Os domínios verificados da escola funcionam automaticamente. Preencha este campo apenas se
          também publicar o website noutra hospedagem, como uma prévia externa.
        </p>
      </div>
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Ligação do site ao SIGA Plus
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          <p>
            Configure o website uma vez com estes endereços. Depois, publicar aqui actualiza os
            conteúdos pela API, sem voltar a compilar o site.
          </p>
          <Label htmlFor="website-api">API de conteúdos públicos</Label>
          <Input id="website-api" readOnly value={endpoint} />
          <Button variant="outline" size="sm" onClick={copyConfiguration}>
            <Copy className="size-4" /> Copiar configuração
          </Button>
          <p className="text-xs text-muted-foreground">
            O login utiliza o endereço desta instalação do SIGA, com a mesma conta e verificação de
            segurança. A configuração não contém chaves nem palavras-passe.
          </p>
        </div>
      </details>
      <div className="space-y-2">
        <Label htmlFor="website-campaign">Candidaturas oficiais</Label>
        <select
          id="website-campaign"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft.campaignSlug}
          disabled={busy}
          onChange={(e) => changeDraft({ ...draft, campaignSlug: e.target.value })}
        >
          <option value="">Manter candidatura demonstrativa</option>
          {(query.data?.campaigns ?? []).map((campaign) => (
            <option key={campaign.slug} value={campaign.slug}>
              {campaign.title || campaign.slug}
              {campaign.is_open ? "" : " · encerrada"}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Ao ligar uma campanha, o site abre o formulário oficial do SIGA, onde os dados são
          enviados à escola. O encerramento da campanha também é respeitado pelo site.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-admission-fee">Taxa de candidatura (Kz)</Label>
          <Input
            id="website-admission-fee"
            type="number"
            min="0"
            max="100000000"
            step="1"
            placeholder="A confirmar pela escola"
            value={draft.admissionFeeAmount ?? ""}
            disabled={busy}
            onChange={(e) =>
              changeDraft({
                ...draft,
                admissionFeeAmount: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Valor informativo publicado no site e na campanha ligada. Não cria cobranças nem activa
            pagamentos. Deixe vazio para confirmar com a secretaria.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-banner-style">Estilo dos destaques</Label>
          <select
            id="website-banner-style"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={draft.bannerStyle ?? "classic"}
            disabled={busy}
            onChange={(e) =>
              changeDraft({ ...draft, bannerStyle: e.target.value as "classic" | "prism" })
            }
          >
            <option value="classic">Azul discreto</option>
            <option value="prism">Azul e roxo</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Aplica tons azul e roxo e movimento suave a alguns destaques. Respeita a preferência de
            movimento reduzido do visitante.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-group">Página ou conteúdo</Label>
          <select
            id="website-group"
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setPage(0);
              setSearch("");
            }}
          >
            {groups.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-search">Procurar um campo</Label>
          <Input
            id="website-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Título, imagem, texto…"
          />
        </div>
      </div>
      <fieldset disabled={busy || templateMismatch} className="space-y-4">
        <legend className="sr-only">Conteúdo de {group}</legend>
        {filtered.slice(page * 24, (page + 1) * 24).map((field) => {
          const value =
            draft.values[field.key] ??
            field.value.replaceAll("ISPAB", query.data?.school.name ?? "ISPAB");
          const id = "website-field-" + field.key;
          const imagePreview =
            field.kind === "image" && safePublicUrl(value, true)
              ? previewImage(value, draft.websiteUrl)
              : undefined;
          return (
            <div key={field.key} className="space-y-2 rounded-xl border border-border p-3">
              <Label htmlFor={id} className="break-words">
                {field.label}
              </Label>
              {field.dataPath?.[0] === "courses" && field.dataPath.at(-1) === "name" && (
                <div className="space-y-2">
                  <Label htmlFor={id + "-program"} className="text-xs text-muted-foreground">
                    Sincronizar com um curso do SIGA
                  </Label>
                  <select
                    id={id + "-program"}
                    value={draft.programBindings[field.key] ?? ""}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => {
                      const programBindings = { ...draft.programBindings };
                      if (e.target.value) programBindings[field.key] = e.target.value;
                      else delete programBindings[field.key];
                      changeDraft({ ...draft, programBindings });
                    }}
                  >
                    <option value="">Gerir o nome no website</option>
                    {(query.data?.programs ?? []).map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                  {draft.programBindings[field.key] && (
                    <p className="text-xs text-muted-foreground">
                      Depois de publicar, o nome acompanha o SIGA automaticamente. Um curso
                      desactivado deixa de aparecer no catálogo. Descrições, imagens e requisitos
                      continuam a ser conteúdos editoriais.
                    </p>
                  )}
                </div>
              )}
              {field.kind === "text" && (value.length > 120 || value.includes("\n")) ? (
                <Textarea
                  id={id}
                  value={value}
                  maxLength={12000}
                  rows={3}
                  onChange={(e) => changeValue(field.key, e.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  value={value}
                  maxLength={12000}
                  type={field.kind === "number" ? "number" : "text"}
                  onChange={(e) => changeValue(field.key, e.target.value)}
                />
              )}
              {imagePreview && (
                <MediaFrame
                  src={imagePreview}
                  alt="Pré-visualização da imagem seleccionada"
                  ratio="3/2"
                  rounded="rounded-md"
                  className="w-36 max-w-full"
                />
              )}
              {field.kind === "asset" && (
                <p className="text-xs text-muted-foreground">
                  Nome do recurso do catálogo, sem extensão (por exemplo, campus). As imagens das
                  páginas aceitam endereços HTTPS.
                </p>
              )}
              {Object.hasOwn(draft.values, field.key) && (
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => {
                    const values = { ...draft.values };
                    delete values[field.key];
                    changeDraft({ ...draft, values });
                  }}
                >
                  Repor conteúdo inicial
                </button>
              )}
            </div>
          );
        })}
      </fieldset>
      {!filtered.length && (
        <p className="text-sm text-muted-foreground">Nenhum campo encontrado nesta secção.</p>
      )}
      {filtered.length > 24 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-xs">
            Página {page + 1} de {Math.ceil(filtered.length / 24)}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * 24 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Seguinte
          </Button>
        </div>
      )}
      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-background py-3">
        <Button disabled={busy || templateMismatch} variant="outline" onClick={() => act("save")}>
          {busy ? "A guardar…" : "Guardar rascunho"}
        </Button>
        <Button disabled={busy || templateMismatch} onClick={() => act("publish")}>
          Publicar no site
        </Button>
        {draft.websiteUrl && safePublicUrl(draft.websiteUrl, true) && (
          <Button variant="outline" asChild>
            <a href={draft.websiteUrl} target="_blank" rel="noopener noreferrer">
              <External className="size-4" /> Ver site publicado
            </a>
          </Button>
        )}
      </div>
      {state.published && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Opções de publicação</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy || dirty}
              size="sm"
              variant="outline"
              onClick={() => act("restore")}
            >
              Repor publicação no rascunho
            </Button>
            <Button disabled={busy} size="sm" variant="outline" onClick={() => act("unpublish")}>
              Retirar publicação da API
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Retirar a publicação mantém as páginas e os conteúdos incluídos na instalação do
            website. Para remover o site do ar, utilize a sua hospedagem.
          </p>
        </details>
      )}
    </div>
  );
}
