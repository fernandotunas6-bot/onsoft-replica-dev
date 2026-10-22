import { useState } from "react";
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
import routes from "../../../painel/escolas/docs/routes.json";
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
const choices = {
  motion: {
    label: "Efeitos de entrada",
    values: {
      original: "Actual",
      fade: "Aparecimento suave",
      rise: "Deslizar discretamente",
      none: "Sem animações",
    },
  },
  photos: {
    label: "Apresentação das imagens",
    values: { original: "Actual", clean: "Limpa", framed: "Moldura de cor" },
  },
  radius: {
    label: "Cantos e botões",
    values: { original: "Actuais", rounded: "Arredondados", square: "Rectos" },
  },
  header: {
    label: "Comportamento do logótipo",
    values: {
      contextual: "Compacto nas páginas internas",
      full: "Marca completa em todas as páginas",
    },
  },
};
const defaultDesign = (): WebsiteDesign => ({
  activeTheme: "campus",
  installedThemes: [],
  overrides: {},
  pages: {},
});
export function WebsiteThemePanel({
  draft,
  schoolName,
  busy,
  logoUrl,
  programs = [],
  onChange,
}: {
  draft: WebsiteDraft;
  schoolName: string;
  busy: boolean;
  logoUrl?: string | null;
  programs?: { id: string; name: string }[];
  onChange: (draft: WebsiteDraft) => void;
}) {
  const design = draft.design ?? defaultDesign(),
    themes = [...builtInThemes, ...design.installedThemes];
  const [scope, setScope] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(""),
    [previewPage, setPreviewPage] = useState("/"),
    [width, setWidth] = useState("desktop"),
    [loading, setLoading] = useState(false);
  const selected = themes.find((theme) => theme.id === design.activeTheme) ?? builtInThemes[0];
  const options = scope ? (design.pages[scope] ?? {}) : design.overrides;
  const appearance = {
    ...selected.appearance,
    ...design.overrides,
    ...(scope ? design.pages[scope] : {}),
  };
  const change = (next: WebsiteDesign) => {
    setError("");
    setPreview("");
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
      const { websiteDraftPreview } = await import("./website-preview");
      const values = { ...draft.values };
      for (const [key, id] of Object.entries(draft.programBindings)) {
        const program = programs.find((item) => item.id === id);
        if (program) values[key] = program.name;
      }
      setPreview(
        websiteDraftPreview(
          { ...draft, values },
          previewPage,
          schoolName,
          window.location.origin,
          logoUrl,
        ),
      );
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
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="">Todo o website</option>
            {routes
              .filter((route) => !route.url.startsWith("/portal/") && route.url !== "/404/")
              .map((route) => (
                <option key={route.url} value={route.url}>
                  {route.title}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground">
            As páginas herdam o tema geral. Ajustes específicos mantêm-se quando muda de tema.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {colors.map(([key, label]) => (
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
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(choices).map(([key, choice]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={"theme-" + key}>{choice.label}</Label>
              <select
                id={"theme-" + key}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={options[key as keyof Appearance] ?? ""}
                onChange={(event) => adjust(key, event.target.value)}
              >
                <option value="">Herdar do tema</option>
                {Object.entries(choice.values).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
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
                setPreview("");
              }}
            >
              {routes
                .filter((route) => !route.url.startsWith("/portal/") && route.url !== "/404/")
                .map((route) => (
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
            Pré-visualização do rascunho. Ligações, formulários e animações estão desactivados nesta
            janela.
          </p>
          <div className="overflow-auto rounded-lg border bg-muted">
            <iframe
              title="Pré-visualização do tema e conteúdos"
              sandbox=""
              srcDoc={preview}
              style={{
                width: width === "mobile" ? 390 : 1280,
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
