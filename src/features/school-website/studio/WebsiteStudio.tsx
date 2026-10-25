import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Puck, type Config } from "@puckeditor/core";
import "@puckeditor/core/no-external.css";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { changeSchoolWebsite, getSchoolWebsiteEditor } from "../content-server";
import { type WebsiteDraft, type WebsiteState } from "../content-model";
import { IDENTITY_PAGES } from "../site-scope";
import { useDraftUnloadWarning } from "../use-draft-unload-warning";
import {
  fieldsForStudioPage,
  mergeStudioValues,
  studioPage,
  studioPages,
  studioValues,
  studioPreviewDraft,
  studioWidths,
  studioZooms,
} from "./adapter";
import { useStudioHistory } from "./use-studio-history";
import { PublicationReview } from "./PublicationReview";
import { StudioFields } from "./StudioFields";
import { StudioPreview } from "./StudioPreview";
import { StudioAppearance } from "./StudioAppearance";
import type { StudioView } from "./navigation";
import "./studio.css";

type EditorData = Awaited<ReturnType<typeof getSchoolWebsiteEditor>>;
type Action = "save" | "publish" | "restore" | "unpublish";
type Root = { values: Record<string, string> };
const permissions = { drag: false, duplicate: false, delete: false, insert: false, edit: true };

export default function WebsiteStudio({
  view,
  onViewChange,
}: {
  view: StudioView;
  onViewChange: (view: StudioView) => void;
}) {
  const account = useCurrentAccount();
  return (
    <SchoolStudio
      key={`${account.id}:${account.schoolId}`}
      accountId={account.id}
      schoolId={account.schoolId ?? ""}
      allowed={account.role === "Administrador"}
      view={view}
      onViewChange={onViewChange}
    />
  );
}
function SchoolStudio({
  accountId,
  schoolId,
  allowed,
  view,
  onViewChange,
}: {
  accountId: string;
  schoolId: string;
  allowed: boolean;
  view: StudioView;
  onViewChange: (view: StudioView) => void;
}) {
  const client = useQueryClient();
  const queryKey = useMemo(
    () => ["school-website-studio", accountId, schoolId],
    [accountId, schoolId],
  );
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getSchoolWebsiteEditor({ signal }),
    enabled: allowed && Boolean(accountId && schoolId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const active = useRef(true);
  const reloadController = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      reloadController.current?.abort();
    };
  }, []);
  if (!allowed)
    return (
      <main className="p-6">
        <h1>Acesso reservado ao Administrador</h1>
        <Link to="/">Voltar ao SIGA</Link>
      </main>
    );
  if (query.isError)
    return (
      <main className="p-6">
        <h1>Não foi possível abrir o estúdio</h1>
        <p role="alert">{query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
        <Link to="/">Voltar ao SIGA</Link>
      </main>
    );
  if (!query.data)
    return (
      <p role="status" className="p-6">
        A confirmar escola e acesso ao website…
      </p>
    );
  return (
    <WebsiteStudioWorkspace
      initial={query.data}
      view={view}
      onViewChange={onViewChange}
      onReload={async () => {
        reloadController.current?.abort();
        const controller = new AbortController();
        reloadController.current = controller;
        const latest = await getSchoolWebsiteEditor({ signal: controller.signal });
        if (!active.current) throw Error("O contexto do estúdio mudou. Abra-o novamente.");
        if (latest.school.public_code !== query.data?.school.public_code)
          throw Error("A escola activa mudou. Abra novamente o estúdio antes de continuar.");
        client.setQueryData<EditorData>(queryKey, latest);
        return latest;
      }}
      onPersist={async (data) => {
        const next = await changeSchoolWebsite({ data });
        if (active.current)
          client.setQueryData<EditorData>(queryKey, (current) =>
            current ? { ...current, state: next } : current,
          );
        // Never invalidate the current account/school indiscriminately after an old request.
        void client.invalidateQueries({ queryKey: ["school-website", schoolId] });
        return next;
      }}
    />
  );
}

/** Reuses the institutional command contract; Puck JSON never becomes another storage format. */
export function WebsiteStudioWorkspace({
  initial,
  view,
  onViewChange,
  onPersist,
  onReload,
}: {
  initial: EditorData;
  view: StudioView;
  onViewChange: (view: StudioView) => void;
  onReload?: () => Promise<EditorData>;
  onPersist: (data: {
    action: Action;
    expectedRevision: number;
    draft?: WebsiteDraft;
  }) => Promise<WebsiteState>;
}) {
  const [state, setState] = useState(initial.state);
  const history = useStudioHistory(initial.state.draft);
  const { draft, change: recordChange, undo: historyUndo, redo: historyRedo } = history;
  const [inspectorVersion, setInspectorVersion] = useState(0);
  const undo = useCallback(() => {
    historyUndo();
    setInspectorVersion((value) => value + 1);
  }, [historyUndo]);
  const redo = useCallback(() => {
    historyRedo();
    setInspectorVersion((value) => value + 1);
  }, [historyRedo]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const publishButton = useRef<HTMLButtonElement>(null);
  const [publishedView, setPublishedView] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pageSearch, setPageSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [tab, setTab] = useState<"content" | "appearance">("content");
  const [mobilePanel, setMobilePanel] = useState("preview");
  const page = studioPage(view.pagina);
  const fields = useMemo(() => fieldsForStudioPage(page.url), [page.url]);
  const groups = useMemo(() => [...new Set(fields.map((field) => field.group))], [fields]);
  const group = groups.includes(selectedGroup)
    ? selectedGroup
    : (groups.find((name) => name.endsWith(` · ${page.url}`)) ?? groups[0]);
  const scopedFields = useMemo(
    () =>
      fields.filter((field) =>
        selectedKeys.length ? selectedKeys.includes(field.key) : field.group === group,
      ),
    [fields, group, selectedKeys],
  );
  const shownDraft = publishedView && state.published ? state.published.content : draft;
  const previewDraft = useMemo(
    () => studioPreviewDraft(shownDraft, initial.programs),
    [shownDraft, initial.programs],
  );
  const lockedKeys = useMemo(
    () => Object.keys(shownDraft.programBindings),
    [shownDraft.programBindings],
  );
  const filteredPages = useMemo(
    () =>
      studioPages.filter((item) =>
        `${item.title} ${item.url}`
          .toLocaleLowerCase("pt")
          .includes(pageSearch.toLocaleLowerCase("pt")),
      ),
    [pageSearch],
  );
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(state.draft),
    [draft, state.draft],
  );
  useDraftUnloadWarning(dirty || busy);
  useBlocker({
    disabled: !dirty && !busy,
    enableBeforeUnload: false,
    shouldBlockFn: ({ current, next }) =>
      current.pathname === next.pathname ? false : busyRef.current || !confirmDiscardChanges(dirty),
  });
  const changeDraft = useCallback(
    (next: WebsiteDraft) => {
      if (busyRef.current || publishedView) return;
      recordChange(next, `${page.url}:${group}:${tab}`);
      setMessage("");
      setError("");
    },
    [recordChange, publishedView, page.url, group, tab],
  );
  const selectFields = useCallback((keys: string[]) => {
    setSelectedKeys(keys);
    setTab("content");
    setMobilePanel("properties");
  }, []);
  useEffect(() => {
    setSelectedKeys([]);
  }, [page.url]);
  const config = useMemo<Config<Record<string, never>, Root>>(
    () => ({
      components: {},
      root: {
        fields: {
          values: {
            type: "custom",
            label: group ?? "Conteúdo",
            render: ({ value, onChange }) => (
              <StudioFields
                key={group}
                fields={scopedFields}
                lockedKeys={lockedKeys}
                focusSelection={selectedKeys.length > 0}
                value={value ?? {}}
                onChange={onChange}
                disabled={busy || publishedView}
              />
            ),
          },
        },
        render: () => (
          <StudioPreview
            key={page.url}
            draft={previewDraft}
            path={page.url}
            schoolName={initial.school.name}
            logoUrl={initial.school.logo_url}
            width={view.largura}
            zoom={view.zoom}
            selecting={selecting && !publishedView}
            fields={fields}
            onSelect={selectFields}
          />
        ),
      },
    }),
    [
      group,
      scopedFields,
      lockedKeys,
      selectedKeys.length,
      previewDraft,
      busy,
      publishedView,
      selecting,
      fields,
      selectFields,
      page.url,
      initial.school.name,
      initial.school.logo_url,
      view.largura,
      view.zoom,
    ],
  );
  const puckData = useMemo(
    () => ({ content: [], root: { props: { values: studioValues(previewDraft, scopedFields) } } }),
    [previewDraft, scopedFields],
  );
  const permanent = (IDENTITY_PAGES as readonly string[]).includes(page.url);
  const included =
    permanent ||
    shownDraft.adoptedPages === undefined ||
    shownDraft.adoptedPages.includes(page.url);
  async function act(action: Action) {
    if (busyRef.current) return;
    if (
      action === "unpublish" &&
      !window.confirm(
        "Retirar os conteúdos publicados da API? O rascunho será conservado; a hospedagem continua disponível.",
      )
    )
      return;
    if (action === "restore" && !confirmDiscardChanges(dirty)) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await onPersist({
        action,
        expectedRevision: state.revision,
        ...(["save", "publish"].includes(action) ? { draft } : {}),
      });
      setState(next);
      if (action === "restore") {
        history.reset(next.draft);
        setInspectorVersion((value) => value + 1);
      } else if (action !== "unpublish") history.rebase(next.draft);
      if (action === "unpublish") setPublishedView(false);
      setMessage(
        {
          save: "Rascunho guardado. A publicação mantém-se.",
          publish: "Conteúdo publicado.",
          restore: "Publicação reposta no rascunho.",
          unpublish: "Conteúdos retirados da API. Rascunho conservado.",
        }[action],
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível guardar. Tente novamente.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function reloadSavedDraft() {
    if (!onReload || busyRef.current || !confirmDiscardChanges(dirty)) return;
    busyRef.current = true;
    setBusy(true);
    setReloading(true);
    try {
      const latest = await onReload();
      setState(latest.state);
      history.reset(latest.state.draft);
      setInspectorVersion((value) => value + 1);
      setSelectedKeys([]);
      setPublishedView(false);
      setReviewOpen(false);
      setError("");
      setMessage("Versão guardada carregada. Pode continuar a editar.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível recarregar. O rascunho foi conservado.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      setReloading(false);
    }
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (!reviewOpen && !busyRef.current && dirty && !publishedView) void act("save");
        return;
      }
      if (reviewOpen) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if (key === "z" && !busyRef.current && !publishedView) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        setMessage("");
        setError("");
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  return (
    <main
      className="website-studio"
      data-mobile-panel={mobilePanel}
      aria-label="SIGA Website Studio"
    >
      <a href="#studio-canvas" className="studio-skip">
        Saltar para a pré-visualização
      </a>
      <header className="studio-topbar">
        <div className="studio-identity">
          <Link to="/" className="studio-back">
            ← SIGA
          </Link>
          <div>
            <strong>Website Studio</strong>
            <span>{initial.school.name}</span>
          </div>
        </div>
        <div className="studio-toolbar" aria-label="Dispositivos de pré-visualização">
          <label>
            Largura
            <select
              aria-label="Largura da pré-visualização"
              value={view.largura}
              onChange={(event) => onViewChange({ ...view, largura: Number(event.target.value) })}
            >
              {studioWidths.map((width) => (
                <option key={width} value={width}>
                  {width} px
                  {width === 390
                    ? " · Telemóvel"
                    : width === 768
                      ? " · Tablet"
                      : width === 1440
                        ? " · Computador"
                        : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zoom
            <select
              aria-label="Zoom da pré-visualização"
              value={view.zoom}
              onChange={(event) => onViewChange({ ...view, zoom: Number(event.target.value) })}
            >
              {studioZooms.map((zoom) => (
                <option key={zoom} value={zoom}>
                  {zoom}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="studio-actions">
          <span className="studio-save-state" role="status">
            {busy
              ? reloading
                ? "A recarregar…"
                : "A guardar…"
              : dirty
                ? "Alterações por guardar"
                : state.published
                  ? "Publicado · sem alterações"
                  : "Rascunho"}
          </span>
          <button type="button" disabled={busy || !dirty} onClick={() => void act("save")}>
            Guardar rascunho
          </button>
          <button
            type="button"
            ref={publishButton}
            className="studio-primary"
            disabled={busy}
            onClick={() => setReviewOpen(true)}
          >
            Publicar
          </button>
        </div>
      </header>
      <div className="studio-mobile-tabs" aria-label="Vistas do estúdio">
        {[
          ["pages", "Páginas"],
          ["preview", "Pré-visualização"],
          ["properties", "Propriedades"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mobilePanel === key}
            onClick={() => setMobilePanel(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {reviewOpen && (
        <PublicationReview
          draft={draft}
          state={state}
          schoolName={initial.school.name}
          onReturnFocus={() => publishButton.current?.focus()}
          onClose={() => setReviewOpen(false)}
          onConfirm={() => {
            setReviewOpen(false);
            void act("publish");
          }}
        />
      )}
      {error && (
        <p className="studio-notice studio-error" role="alert">
          {error}
          {onReload && (
            <button type="button" disabled={busy} onClick={() => void reloadSavedDraft()}>
              Recarregar versão guardada
            </button>
          )}
        </p>
      )}
      {message && (
        <p className="studio-notice" role="status">
          {message}
        </p>
      )}
      <Puck
        key={`${page.url}:${group}:${selectedKeys.join(",")}:${publishedView}:${inspectorVersion}`}
        config={config}
        data={puckData}
        iframe={{ enabled: false }}
        permissions={permissions}
        onChange={(data) => {
          const next = mergeStudioValues(
            draft,
            data.root.props?.values,
            scopedFields.filter((field) => !lockedKeys.includes(field.key)),
          );
          if (!publishedView && next !== draft) changeDraft(next);
        }}
      >
        <div className="studio-workspace">
          <aside className="studio-pages" aria-label="Páginas do website">
            <div className="studio-panel-heading">
              <h1>Páginas</h1>
              <span>{studioPages.length}</span>
            </div>
            <input
              aria-label="Procurar páginas"
              type="search"
              placeholder="Procurar página…"
              value={pageSearch}
              onChange={(event) => setPageSearch(event.target.value)}
            />
            <nav aria-label="Seleccionar página">
              {filteredPages.map((item) => (
                <button
                  type="button"
                  key={item.url}
                  disabled={busy}
                  aria-current={item.url === page.url ? "page" : undefined}
                  onClick={() => {
                    setSelectedKeys([]);
                    onViewChange({ ...view, pagina: item.url });
                    setMobilePanel("preview");
                  }}
                >
                  <span>{item.url === "/" ? "Página inicial" : item.title}</span>
                  <small>{item.url}</small>
                </button>
              ))}
            </nav>
            {!filteredPages.length && <p>Nenhuma página encontrada.</p>}
            <div className="studio-secondary-links">
              <Link to="/configuracoes" search={{ painel: "website.advanced" }}>
                Configurações completas
              </Link>
              <Link to="/configuracoes" search={{ painel: "website.blog" }}>
                Blog da escola
              </Link>
            </div>
          </aside>
          <section
            className="studio-canvas"
            id="studio-canvas"
            tabIndex={-1}
            aria-label="Pré-visualização da página"
          >
            <div className="studio-canvas-caption">
              <span>{page.url === "/" ? "Página inicial" : page.title}</span>
              <span>
                {view.largura} px · {view.zoom}% ·{" "}
                {publishedView ? "Publicação guardada" : "Rascunho privado"}
              </span>
            </div>
            <div className="studio-edit-toolbar" aria-label="Controlos de edição">
              <div>
                <button
                  type="button"
                  disabled={busy || publishedView || !history.canUndo}
                  onClick={() => {
                    undo();
                    setMessage("");
                    setError("");
                  }}
                >
                  Desfazer
                </button>
                <button
                  type="button"
                  disabled={busy || publishedView || !history.canRedo}
                  onClick={() => {
                    redo();
                    setMessage("");
                    setError("");
                  }}
                >
                  Refazer
                </button>
              </div>
              <div>
                <button
                  type="button"
                  aria-pressed={selecting && !publishedView}
                  disabled={publishedView}
                  onClick={() => setSelecting((value) => !value)}
                >
                  Seleccionar elemento
                </button>
                {state.published && (
                  <button
                    type="button"
                    aria-pressed={publishedView}
                    onClick={() => {
                      setPublishedView((value) => !value);
                      setSelectedKeys([]);
                    }}
                  >
                    {publishedView ? "Voltar ao rascunho" : "Ver publicação"}
                  </button>
                )}
              </div>
            </div>
            {publishedView && (
              <p className="studio-readonly" role="status">
                Publicação guardada · apenas leitura. Os nomes de cursos reflectem o catálogo
                académico actual.
              </p>
            )}
            {selecting && !publishedView && (
              <p className="studio-readonly">
                Seleccione um elemento na prévia ou use Tab e Enter dentro da página.
              </p>
            )}
            <div className="studio-canvas-scroll">
              <Puck.Preview />
            </div>
          </section>
          <aside className="studio-inspector" aria-label="Propriedades da página">
            <div className="studio-inspector-tabs">
              <button
                type="button"
                aria-pressed={tab === "content"}
                onClick={() => setTab("content")}
              >
                Conteúdo
              </button>
              <button
                type="button"
                aria-pressed={tab === "appearance"}
                onClick={() => setTab("appearance")}
              >
                Aparência
              </button>
            </div>
            <div className="studio-inspector-body">
              {!permanent && (
                <label className="studio-adoption">
                  <input
                    type="checkbox"
                    aria-label="Incluir esta página na publicação"
                    checked={included}
                    disabled={busy || publishedView}
                    onChange={(event) => {
                      const adopted = draft.adoptedPages ?? studioPages.map((item) => item.url);
                      changeDraft({
                        ...draft,
                        adoptedPages: event.target.checked
                          ? [...new Set([...adopted, page.url])]
                          : adopted.filter((path) => path !== page.url),
                      });
                    }}
                  />
                  Incluir esta página na publicação
                </label>
              )}
              {!included && (
                <p className="studio-muted">
                  Esta página ainda não faz parte da publicação. A prévia mostra o modelo para
                  edição.
                </p>
              )}
              {tab === "content" ? (
                <>
                  <label htmlFor="studio-section">Secção</label>
                  <select
                    id="studio-section"
                    value={group ?? ""}
                    onChange={(event) => {
                      setSelectedGroup(event.target.value);
                      setSelectedKeys([]);
                    }}
                  >
                    {groups.map((name) => (
                      <option key={name} value={name}>
                        {name.split(" · /")[0]}
                      </option>
                    ))}
                  </select>
                  {selectedKeys.length > 0 && (
                    <div className="studio-selection-status" role="status">
                      <span>{selectedKeys.length} campo(s) do elemento seleccionado</span>
                      <button type="button" onClick={() => setSelectedKeys([])}>
                        Ver secção inteira
                      </button>
                    </div>
                  )}
                  <Puck.Fields />
                </>
              ) : (
                <StudioAppearance
                  draft={shownDraft}
                  path={page.url}
                  disabled={busy || publishedView}
                  onChange={changeDraft}
                />
              )}
              {state.published && (
                <div className="studio-publication-actions">
                  <button type="button" disabled={busy} onClick={() => void act("restore")}>
                    Repor publicação no rascunho
                  </button>
                  <button type="button" disabled={busy} onClick={() => void act("unpublish")}>
                    Retirar publicação da API
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </Puck>
    </main>
  );
}
