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
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
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
}: {
  initial: EditorData;
  view: StudioView;
  onViewChange: (view: StudioView) => void;
  onPersist: (data: {
    action: Action;
    expectedRevision: number;
    draft?: WebsiteDraft;
  }) => Promise<WebsiteState>;
}) {
  const [state, setState] = useState(initial.state);
  const [draft, setDraft] = useState(initial.state.draft);
  const [busy, setBusy] = useState(false);
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
    () => fields.filter((field) => field.group === group),
    [fields, group],
  );
  const previewDraft = useMemo(
    () => studioPreviewDraft(draft, initial.programs),
    [draft, initial.programs],
  );
  const lockedKeys = useMemo(() => Object.keys(draft.programBindings), [draft.programBindings]);
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
  const changeDraft = useCallback((next: WebsiteDraft) => {
    if (busyRef.current) return;
    setDraft(next);
    setMessage("");
    setError("");
  }, []);
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
                value={value ?? {}}
                onChange={onChange}
                disabled={busy}
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
          />
        ),
      },
    }),
    [
      group,
      scopedFields,
      lockedKeys,
      previewDraft,
      busy,
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
    permanent || draft.adoptedPages === undefined || draft.adoptedPages.includes(page.url);
  async function act(action: Action) {
    if (busyRef.current) return;
    if (
      action === "publish" &&
      !window.confirm(
        `Publicar o conteúdo actual do website de ${initial.school.name}? As alterações por guardar também serão publicadas.`,
      )
    )
      return;
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
      if (action !== "unpublish") setDraft(next.draft);
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
              ? "A guardar…"
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
            className="studio-primary"
            disabled={busy}
            onClick={() => void act("publish")}
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
      {error && (
        <p className="studio-notice studio-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="studio-notice" role="status">
          {message}
        </p>
      )}
      <Puck
        key={`${page.url}:${group}`}
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
          if (next !== draft) changeDraft(next);
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
                {view.largura} px · {view.zoom}% · Rascunho privado
              </span>
            </div>
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
                    checked={included}
                    disabled={busy}
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
                    onChange={(event) => setSelectedGroup(event.target.value)}
                  >
                    {groups.map((name) => (
                      <option key={name} value={name}>
                        {name.split(" · /")[0]}
                      </option>
                    ))}
                  </select>
                  <Puck.Fields />
                </>
              ) : (
                <StudioAppearance
                  draft={draft}
                  path={page.url}
                  disabled={busy}
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
