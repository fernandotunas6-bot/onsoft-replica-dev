import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  builtInThemes,
  parseThemePackage,
  parseWebsiteDesign,
  publishDesign,
  resolveAppearance,
  type Appearance,
  type WebsiteDesign,
  type ThemePackage,
} from "../../../painel/escolas/src/design.mjs";
import { designOptionGroups } from "./website-design-options";
import routes from "../../../painel/escolas/docs/routes.json";
import { copyPageAppearance, editableWebsitePages } from "./page-appearance";
import type { WebsiteDraft } from "./content-model";
const colors: [keyof Appearance, string][] = [
  ["primary", "Cor principal"],
  ["secondary", "Cor secundária"],
  ["background", "Fundo da página"],
  ["surface", "Fundo das secções"],
  ["text", "Texto"],
  ["heading", "Títulos"],
  ["onPrimary", "Texto dos botões"],
  ["footer", "Fundo do rodapé"],
  ["footerText", "Texto do rodapé"],
];
const defaultDesign = (): WebsiteDesign => ({
  activeTheme: "campus",
  installedThemes: [],
  overrides: {},
  pages: {},
});
const emptyPrograms: { id: string; name: string }[] = [];
export function WebsiteThemePanel({
  draft,
  schoolName,
  busy,
  logoUrl,
  programs = emptyPrograms,
  onChange,
  onEditPage,
}: {
  draft: WebsiteDraft;
  schoolName: string;
  busy: boolean;
  logoUrl?: string | null;
  programs?: { id: string; name: string }[];
  onChange: (draft: WebsiteDraft) => void;
  onEditPage?: (path: string) => void;
}) {
  const design = draft.design ?? defaultDesign(),
    themes = [...builtInThemes, ...design.installedThemes];
  const [scope, setScope] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{ html: string; stamp: string; page: string } | null>(null),
    [search, setSearch] = useState(""),
    [customOnly, setCustomOnly] = useState(false),
    [previewPage, setPreviewPage] = useState("/"),
    [width, setWidth] = useState("desktop"),
    [loading, setLoading] = useState(false),
    [sourcePage, setSourcePage] = useState(""),
    [copyMode, setCopyMode] = useState<"merge" | "replace">("merge"),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState<{
      target: string;
      previous: Partial<Appearance> | undefined;
      after: string;
    } | null>(null);
  const selectScope = (path: string) => {
    setScope(path);
    setPreviewPage(path || "/");
    setSourcePage("");
    setCopyMode("merge");
    setError("");
    setNotice("");
  };
  const customPages = editableWebsitePages.filter(
    (page) => Object.keys(design.pages[page.url] ?? {}).length > 0,
  );
  const sources = customPages.filter((page) => page.url !== scope);
  const selected = themes.find((theme) => theme.id === design.activeTheme) ?? builtInThemes[0];
  const options = scope ? (design.pages[scope] ?? {}) : design.overrides;
  const inherited = { ...selected.appearance, ...(scope ? design.overrides : {}) };
  const stamp = useMemo(
    () => JSON.stringify({ draft, schoolName, logoUrl, programs }),
    [draft, schoolName, logoUrl, programs],
  );
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll("transparencia", "transluc");
  const query = normalize(search.trim());
  const terms = query.split(/\s+/).filter(Boolean);
  const matches = (value: string) =>
    !terms.length || terms.every((term) => normalize(value).includes(term));
  const customized = (key: keyof Appearance) => Object.hasOwn(options, key);
  const filteredColors = colors.filter(
    ([key, label]) =>
      (!customOnly || customized(key)) && (matches(label) || matches("Cores e fundos")),
  );
  const filteredGroups = designOptionGroups
    .map((group) => ({
      ...group,
      controls: group.controls.filter(
        (control) =>
          (!customOnly || customized(control.key)) &&
          matches(
            [
              group.title,
              group.description,
              control.key,
              control.label,
              ...Object.values(control.values),
            ].join(" "),
          ),
      ),
    }))
    .filter((group) => group.controls.length);
  const customCount = Object.keys(options).length;
  const visibleCount =
    filteredColors.length +
    filteredGroups.reduce((count, group) => count + group.controls.length, 0);
  const appearance = {
    ...selected.appearance,
    ...design.overrides,
    ...(scope ? design.pages[scope] : {}),
  };
  const change = (next: WebsiteDesign) => {
    setError("");
    setNotice("");
    setCopied(null);
    onChange({ ...draft, design: next });
  };
  const adjust = (key: string, value: string) => {
    const next = { ...options };
    if (value === "") delete next[key as keyof Appearance];
    else Object.assign(next, { [key]: value });
    change(
      scope
        ? { ...design, pages: { ...design.pages, [scope]: next } }
        : { ...design, overrides: next },
    );
  };
  async function install(file: File | undefined) {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      if (file.size > 32768) throw Error("O ficheiro do tema deve ter até 32 KB.");
      const theme = parseThemePackage(JSON.parse(await file.text()));
      if (themes.some((item) => item.id === theme.id))
        throw Error(
          "Já existe um tema com este identificador. Altere o identificador no pacote antes de instalar.",
        );
      const next = parseWebsiteDesign({
        ...design,
        installedThemes: [...design.installedThemes, theme],
      });
      change(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível instalar o tema.");
    } finally {
      setLoading(false);
    }
  }
  function download() {
    try {
      const current = resolveAppearance(publishDesign(design));
      const theme: ThemePackage = {
        format: "siga-school-theme",
        version: 1,
        id: "custom-" + selected.id.replace(/^custom-/, ""),
        name: (selected.name + " personalizado").slice(0, 60),
        description: "Tema personalizável do website escolar.",
        appearance: current,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = theme.id + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar.");
    }
  }
  async function showPreview() {
    setError("");
    setLoading(true);
    try {
      const { websiteDraftPreview, loadWebsitePreviewWordmark } = await import("./website-preview");
      const wordmark =
        /^ISPAB/i.test(schoolName) && !logoUrl
          ? await loadWebsitePreviewWordmark(window.location.origin)
          : null;
      const values = { ...draft.values };
      for (const [key, id] of Object.entries(draft.programBindings)) {
        const program = programs.find((item) => item.id === id);
        if (program) values[key] = program.name;
      }
      setPreview({
        html: websiteDraftPreview(
          { ...draft, values },
          previewPage,
          schoolName,
          window.location.origin,
          logoUrl,
          wordmark,
        ),
        stamp,
        page: previewPage,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível preparar a pré-visualização.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-xl border border-border p-4"
      aria-labelledby="website-themes-title"
    >
      <div className="space-y-1">
        <h4 id="website-themes-title" className="font-medium">
          Temas e personalização
        </h4>
        <p className="text-sm text-muted-foreground">
          Mude a apresentação sem perder páginas, cursos ou textos. Experimente no rascunho e
          utilize Publicar quando estiver pronto.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <fieldset disabled={busy || loading} className="space-y-4">
        <legend className="sr-only">Aparência do website</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {themes.map((theme) => (
            <article key={theme.id} className="space-y-2 rounded-lg border border-border p-3">
              <div
                aria-hidden="true"
                className="h-12 rounded-md border"
                style={{
                  background: `linear-gradient(115deg,${theme.appearance.primary},${theme.appearance.secondary})`,
                }}
              />
              <h5 className="font-medium">{theme.name}</h5>
              <p className="text-xs text-muted-foreground">{theme.description}</p>
              <Button
                size="sm"
                variant={theme.id === design.activeTheme ? "default" : "outline"}
                aria-pressed={theme.id === design.activeTheme}
                onClick={() => change({ ...design, activeTheme: theme.id })}
              >
                {theme.id === design.activeTheme
                  ? "Seleccionado no rascunho"
                  : "Aplicar " + theme.name}
              </Button>
              {theme.id.startsWith("custom-") && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={theme.id === design.activeTheme}
                  onClick={() =>
                    change({
                      ...design,
                      installedThemes: design.installedThemes.filter(
                        (item) => item.id !== theme.id,
                      ),
                    })
                  }
                >
                  Remover {theme.name}
                </Button>
              )}
            </article>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-theme-file">Instalar tema compatível (.json)</Label>
          <Input
            id="website-theme-file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void install(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Até oito temas personalizados. Exporte um modelo, ajuste-o e instale o ficheiro. Pacotes
            SIGA Website v1, até 32 KB; não executam código ou plugins.
          </p>
          <Button variant="outline" size="sm" onClick={download}>
            Exportar tema / obter modelo
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-design-scope">Personalizar aparência de</Label>
          <select
            id="website-design-scope"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={scope}
            onChange={(event) => {
              selectScope(event.target.value);
            }}
          >
            <option value="">Todo o website</option>
            {editableWebsitePages.map((route) => (
              <option key={route.url} value={route.url}>
                {route.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            As páginas herdam o tema geral. Ajustes específicos mantêm-se quando muda de tema.
          </p>
        </div>
        {customPages.length > 0 && (
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Páginas personalizadas ({customPages.length})
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {customPages.map((page) => (
                <Button
                  key={page.url}
                  variant="outline"
                  size="sm"
                  aria-pressed={scope === page.url}
                  onClick={() => selectScope(page.url)}
                >
                  {page.title} · {Object.keys(design.pages[page.url]).length}{" "}
                  {Object.keys(design.pages[page.url]).length === 1 ? "ajuste" : "ajustes"}
                </Button>
              ))}
            </div>
          </details>
        )}
        {scope && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">
                Personalização de {editableWebsitePages.find((page) => page.url === scope)?.title}
              </p>
              {onEditPage && (
                <Button variant="outline" size="sm" onClick={() => onEditPage(scope)}>
                  Editar textos e imagens desta página
                </Button>
              )}
            </div>
            {sources.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="website-style-source">Copiar personalizações de</Label>
                    <select
                      id="website-style-source"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={sourcePage}
                      onChange={(event) => setSourcePage(event.target.value)}
                    >
                      <option value="">Escolher página de origem</option>
                      {sources.map((page) => (
                        <option key={page.url} value={page.url}>
                          {page.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="website-style-copy-mode">Como aplicar os estilos</Label>
                    <select
                      id="website-style-copy-mode"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={copyMode}
                      onChange={(event) => setCopyMode(event.target.value as "merge" | "replace")}
                    >
                      <option value="merge">Juntar aos ajustes desta página</option>
                      <option value="replace">Substituir os ajustes desta página</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  A cópia inclui as opções visuais definidas na origem. Em Juntar, essas opções
                  prevalecem quando já existe um ajuste igual. Em Substituir, a página passa a usar
                  apenas os ajustes copiados. O tema geral e os conteúdos são geridos separadamente.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!sources.some((page) => page.url === sourcePage)}
                  onClick={() => {
                    setNotice("");
                    try {
                      const next = copyPageAppearance(design, sourcePage, scope, copyMode);
                      const previous = design.pages[scope];
                      change(next);
                      setCopied({
                        target: scope,
                        previous: previous ? { ...previous } : undefined,
                        after: JSON.stringify(next),
                      });
                      setNotice("Personalizações copiadas para o rascunho desta página.");
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Não foi possível copiar os estilos.",
                      );
                    }
                  }}
                >
                  Copiar personalizações
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Personalize outra página para poder reutilizar os seus ajustes aqui.
              </p>
            )}
            {copied?.target === scope && copied.after === JSON.stringify(design) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const pages = { ...design.pages };
                  if (copied.previous) pages[scope] = copied.previous;
                  else delete pages[scope];
                  change({ ...design, pages });
                  setNotice("A cópia foi desfeita no rascunho.");
                }}
              >
                Desfazer cópia
              </Button>
            )}
            {notice && (
              <p role="status" className="text-xs text-muted-foreground">
                {notice}
              </p>
            )}
          </div>
        )}
        <div className="space-y-3 rounded-lg bg-muted/40 p-3">
          <div className="space-y-1">
            <Label htmlFor="website-design-search">Pesquisar opções de aparência</Label>
            <Input
              id="website-design-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: rodapé, transparência ou botões"
            />
          </div>
          <label htmlFor="website-design-custom-only" className="flex items-center gap-2 text-sm">
            <input
              id="website-design-custom-only"
              aria-label="Mostrar apenas opções personalizadas"
              type="checkbox"
              checked={customOnly}
              onChange={(event) => setCustomOnly(event.target.checked)}
            />
            Mostrar apenas opções personalizadas
          </label>
          <p className="text-xs text-muted-foreground" role="status">
            {customCount} {customCount === 1 ? "personalização" : "personalizações"}{" "}
            {scope ? "nesta página" : customCount === 1 ? "global" : "globais"}.{" "}
            {scope
              ? "As restantes opções herdam a aparência geral."
              : "As restantes opções herdam o tema seleccionado."}
            {(query || customOnly) &&
              ` ${visibleCount} ${visibleCount === 1 ? "opção encontrada" : "opções encontradas"}.`}
          </p>
        </div>
        {!filteredColors.length && !filteredGroups.length && (
          <p role="status" className="text-sm text-muted-foreground">
            Nenhuma opção corresponde aos filtros.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setSearch("");
                setCustomOnly(false);
              }}
            >
              Limpar filtros
            </button>
          </p>
        )}
        {filteredColors.length > 0 && (
          <details className="rounded-lg border border-border p-3" open>
            <summary className="cursor-pointer text-sm font-medium">
              Cores e fundos
              {colors.some(([key]) => customized(key)) && (
                <span className="ml-2 text-xs text-muted-foreground">· Personalizado</span>
              )}
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {filteredColors.map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={"theme-" + key}>{label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={"theme-" + key}
                      type="color"
                      value={appearance[key]}
                      onChange={(event) => adjust(key, event.target.value)}
                      className="h-10 w-16 p-1"
                    />
                    <span className="text-xs text-muted-foreground">{appearance[key]}</span>
                    {customized(key) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => adjust(key, "")}
                        aria-label={"Herdar " + label.toLowerCase()}
                      >
                        Herdar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
        {filteredGroups.map((group) => (
          <details
            key={group.title}
            className="rounded-lg border border-border p-3"
            open={Boolean(query || customOnly)}
          >
            <summary className="cursor-pointer text-sm font-medium">
              {group.title}
              {designOptionGroups
                .find((item) => item.title === group.title)
                ?.controls.some((control) => customized(control.key)) && (
                <span className="ml-2 text-xs text-muted-foreground">· Personalizado</span>
              )}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">{group.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.controls.map(({ key, label, values }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={"theme-" + key}>{label}</Label>
                  <select
                    id={"theme-" + key}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={options[key] ?? ""}
                    onChange={(event) => adjust(key, event.target.value)}
                  >
                    <option value="">Herdar ({values[inherited[key]] ?? inherited[key]})</option>
                    {Object.entries(values).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                const next = { ...options };
                for (const { key } of designOptionGroups.find((item) => item.title === group.title)!
                  .controls)
                  delete next[key];
                change(
                  scope
                    ? { ...design, pages: { ...design.pages, [scope]: next } }
                    : { ...design, overrides: next },
                );
              }}
            >
              Repor {group.title.toLowerCase()}
            </Button>
          </details>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (scope) {
              const pages = { ...design.pages };
              delete pages[scope];
              change({ ...design, pages });
            } else change({ ...design, overrides: {} });
          }}
        >
          Repor ajustes {scope ? "desta página" : "globais"}
        </Button>
        <p className="text-xs text-muted-foreground">
          O contraste é verificado antes de guardar. A preferência de movimento reduzido do
          visitante tem prioridade. O logótipo próprio continua em Identidade da escola; textos,
          imagens e ligações estão no editor de conteúdos abaixo.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="theme-preview-page">Página para pré-visualizar</Label>
            <select
              id="theme-preview-page"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={previewPage}
              onChange={(event) => {
                setPreviewPage(event.target.value);
              }}
            >
              {editableWebsitePages.map((route) => (
                <option key={route.url} value={route.url}>
                  {route.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="theme-preview-width">Tamanho da pré-visualização</Label>
            <select
              id="theme-preview-width"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            >
              <option value="desktop">Desktop</option>
              <option value="tablet">Tablet</option>
              <option value="mobile">Telemóvel</option>
            </select>
          </div>
        </div>
        <Button variant="outline" onClick={() => void showPreview()}>
          Pré-visualizar rascunho
        </Button>
      </fieldset>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          A preparar…
        </p>
      )}
      {preview && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Pré-visualização de{" "}
            {routes.find((route) => route.url === preview.page)?.title ?? preview.page}. Ligações,
            formulários e animações estão desactivados nesta janela.
          </p>
          <div className="overflow-auto rounded-lg border bg-muted">
            {(preview.stamp !== stamp || preview.page !== previewPage) && (
              <p role="status" className="p-3 text-sm">
                A pré-visualização está desactualizada. Utilize Pré-visualizar rascunho para ver as
                alterações actuais.
              </p>
            )}
            <iframe
              title="Pré-visualização do tema e conteúdos"
              sandbox=""
              srcDoc={preview.html}
              style={{
                width: width === "mobile" ? 390 : width === "tablet" ? 820 : 1280,
                maxWidth: width === "mobile" ? "100%" : undefined,
                height: 640,
                border: 0,
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
