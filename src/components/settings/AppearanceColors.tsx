import { useState } from "react";
import {
  Building2,
  Check,
  Dices,
  ExternalLink,
  Layers,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Rows3,
  Sliders,
  Sun,
  Upload,
  Sparkles,
} from "lucide-react";
import {
  accentPresets,
  densityPresets,
  sidebarPresets,
  useAppearance,
  type ThemeMode,
  type UiDensity,
} from "@/lib/appearance";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { isReadableBrandColor, normalizeBrandHex } from "@/lib/brand-tokens";
import { colorThemes, tweakcnThemes } from "@/config/theme-data";
import { radiusOptions, baseColors } from "@/config/theme-customizer-constants";
import { ColorPicker } from "@/components/theme-customizer/ColorPicker";
import { ImportThemeModal } from "@/components/theme-customizer/ImportThemeModal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const modes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3">
        <Label className="text-sm font-semibold">{title}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Painel de personalização e aparência do SIGA com todas as capacidades do admin */
export function AppearanceColors() {
  const {
    state,
    set,
    reset,
    toggleDark,
    applyShadcnTheme,
    applyTweakcnTheme,
    applyImportedTheme,
    setCustomVar,
  } = useAppearance();
  const { school } = useSchoolSettings();

  const [activeTab, setActiveTab] = useState<"siga" | "presets" | "custom">("siga");
  const [importModalOpen, setImportModalOpen] = useState(false);

  const schoolPrimary = normalizeBrandHex(school?.branding?.primary_color);
  const schoolSecondary = normalizeBrandHex(school?.branding?.secondary_color);
  const schoolBrandActive = Boolean(
    schoolPrimary &&
    !state.preferPersonalAccent &&
    !state.shadcnTheme &&
    !state.tweakcnTheme &&
    !state.importedTheme,
  );

  const handleRandomShadcn = () => {
    const randomTheme = colorThemes[Math.floor(Math.random() * colorThemes.length)];
    if (randomTheme) applyShadcnTheme(randomTheme.value);
  };

  const handleRandomTweakcn = () => {
    const randomTheme = tweakcnThemes[Math.floor(Math.random() * tweakcnThemes.length)];
    if (randomTheme) applyTweakcnTheme(randomTheme.value);
  };

  const useSchoolBrand = () => {
    if (!schoolPrimary) return;
    set({
      preferPersonalAccent: false,
      schoolBrand: { primary: schoolPrimary, secondary: schoolSecondary },
      shadcnTheme: "",
      tweakcnTheme: "",
      importedTheme: null,
      customVars: {},
    });
  };

  return (
    <div className="space-y-4">
      {/* Controlo de Modo e Modo Rápido */}
      <Section
        title="Modo de Exibição"
        hint="Aplica-se de imediato e fica guardado neste dispositivo."
      >
        <div className="grid grid-cols-3 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={(e) => {
                if (m.id !== state.mode) {
                  if (m.id === "dark" || m.id === "light") {
                    toggleDark(e);
                  } else {
                    set({ mode: m.id });
                  }
                }
              }}
              aria-pressed={state.mode === m.id}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors cursor-pointer",
                state.mode === m.id
                  ? "border-primary bg-primary/10 text-primary-strong shadow-xs"
                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <m.icon className="size-4" />
              {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Densidade da interface"
        hint="Afecta tabelas, cartões e espaçamento geral. Ideal para ecrãs pequenos ou listas longas."
      >
        <div className="grid grid-cols-3 gap-2">
          {densityPresets.map((preset) => {
            const active = (state.density ?? "comfortable") === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => set({ density: preset.id as UiDensity })}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-colors cursor-pointer",
                  active
                    ? "border-primary bg-primary/10 text-primary-strong shadow-xs"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <Rows3 className="size-3.5" />
                  {preset.label}
                </span>
                <span className="text-[10px] leading-snug opacity-80">{preset.hint}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Tabs organizadas para estilo e temas */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "siga" | "presets" | "custom")}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 rounded-xl p-1 bg-muted/70">
          <TabsTrigger value="siga" className="text-xs font-semibold gap-1.5 rounded-lg">
            <Palette className="size-3.5" />
            SIGA Nativo
          </TabsTrigger>
          <TabsTrigger value="presets" className="text-xs font-semibold gap-1.5 rounded-lg">
            <Sparkles className="size-3.5" />
            Temas Prontos
          </TabsTrigger>
          <TabsTrigger value="custom" className="text-xs font-semibold gap-1.5 rounded-lg">
            <Sliders className="size-3.5" />
            Avançado & CSS
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Paleta SIGA Nativa */}
        <TabsContent value="siga" className="space-y-4 pt-2">
          {schoolPrimary ? (
            <Section
              title="Identidade da Escola"
              hint="Cores guardadas em Identidade Digital. Prevalecem sobre o accent SIGA neste dispositivo, salvo se escolher um preset pessoal."
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="size-9 rounded-lg border border-border shadow-xs"
                  style={{ backgroundColor: schoolPrimary }}
                  title={schoolPrimary}
                />
                {schoolSecondary ? (
                  <span
                    className="size-9 rounded-lg border border-border shadow-xs"
                    style={{ backgroundColor: schoolSecondary }}
                    title={schoolSecondary}
                  />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={schoolBrandActive ? "default" : "outline"}
                  className="gap-1.5"
                  onClick={useSchoolBrand}
                >
                  <Building2 className="size-3.5" />
                  {schoolBrandActive ? "A usar cores da escola" : "Usar cores da escola"}
                </Button>
                {!isReadableBrandColor(schoolPrimary) ? (
                  <p className="w-full text-xs text-amber-700 dark:text-amber-300">
                    A cor primária da escola tem contraste baixo — ajuste em Identidade Digital.
                  </p>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section
            title="Cor de Destaque SIGA"
            hint="Botões, gráficos, ícones e estados activos em OKLCH com contraste AA."
          >
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {accentPresets.map((p) => {
                const isSelected =
                  state.preferPersonalAccent &&
                  !state.shadcnTheme &&
                  !state.tweakcnTheme &&
                  !state.importedTheme &&
                  state.accent === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={p.label}
                    aria-label={`Cor do sistema: ${p.label}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      set({
                        accent: p.id,
                        preferPersonalAccent: true,
                        shadcnTheme: "",
                        tweakcnTheme: "",
                        importedTheme: null,
                        customVars: {},
                      });
                    }}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-xl ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-105 cursor-pointer",
                      isSelected ? "ring-primary scale-105" : "ring-transparent",
                    )}
                    style={{ backgroundColor: p.swatch }}
                  >
                    {isSelected ? <Check className="size-4 text-white" /> : null}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            title="Fundo da Barra Lateral (Sidebar)"
            hint="Escolha o tom de apresentação do menu principal."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sidebarPresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={state.sidebar === p.id}
                  onClick={() => set({ sidebar: p.id })}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer",
                    state.sidebar === p.id
                      ? "border-primary bg-primary/10 text-primary-strong shadow-xs"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <span
                    className="size-6 shrink-0 rounded-lg border border-border"
                    style={{ backgroundColor: p.swatch }}
                  />
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* Tab 2: Presets Shadcn & Tweakcn do Admin */}
        <TabsContent value="presets" className="space-y-4 pt-2">
          {/* Temas Shadcn UI */}
          <Section
            title="Temas Shadcn UI"
            hint="Paletas de cores profissionais adaptadas para modo claro e escuro."
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Escolha um esquema de cor:
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRandomShadcn}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Dices className="size-3.5" />
                  Aleatório
                </Button>
              </div>

              <Select
                value={state.shadcnTheme || ""}
                onValueChange={(val) => {
                  if (val) applyShadcnTheme(val);
                }}
              >
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue placeholder="Selecione um tema Shadcn UI…" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {colorThemes.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <div className="flex gap-1 items-center">
                          <span
                            className="size-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.primary }}
                          />
                          <span
                            className="size-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.secondary }}
                          />
                          <span
                            className="size-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.accent }}
                          />
                        </div>
                        <span className="font-medium text-xs">{theme.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Temas Tweakcn */}
          <Section
            title="Temas Estilizados Tweakcn"
            hint="Coleção de estilos modernos, minimalistas e dinâmicos."
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Escolha um estilo:
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRandomTweakcn}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Dices className="size-3.5" />
                  Aleatório
                </Button>
              </div>

              <Select
                value={state.tweakcnTheme || ""}
                onValueChange={(val) => {
                  if (val) applyTweakcnTheme(val);
                }}
              >
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue placeholder="Selecione um tema Tweakcn…" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {tweakcnThemes.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <div className="flex gap-1 items-center">
                          <span
                            className="size-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.primary }}
                          />
                          <span
                            className="size-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.secondary }}
                          />
                          <span
                            className="size-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.accent }}
                          />
                        </div>
                        <span className="font-medium text-xs">{theme.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>
        </TabsContent>

        {/* Tab 3: Avançado, Color Pickers & Importação */}
        <TabsContent value="custom" className="space-y-4 pt-2">
          {/* Importador de Tema CSS */}
          <Section
            title="Importar Tema CSS"
            hint="Cole código CSS gerado no tweakcn.com ou em ferramentas de design."
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportModalOpen(true)}
                className="gap-2 flex-1"
              >
                <Upload className="size-4" />
                Importar CSS Personalizado
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-2"
                onClick={() =>
                  typeof window !== "undefined" &&
                  window.open("https://tweakcn.com/editor/theme", "_blank")
                }
              >
                <ExternalLink className="size-3.5" />
                Criador Tweakcn
              </Button>
            </div>
            {state.importedTheme ? (
              <p className="mt-2 text-xs font-semibold text-primary">
                ✓ Tema CSS importado ativo neste browser.
              </p>
            ) : null}
          </Section>

          {/* Cores da Marca (Accordion) */}
          <Accordion
            type="single"
            collapsible
            className="w-full rounded-2xl border border-border bg-card overflow-hidden"
          >
            <AccordionItem value="brand-colors" className="border-none">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <span className="text-sm font-semibold">Cores da Marca e Variáveis CSS</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-1 space-y-3 border-t border-border/60 bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  Ajuste diretamente cada tom de cor da interface:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {baseColors.map((color) => (
                    <ColorPicker
                      key={color.cssVar}
                      label={color.name}
                      cssVar={color.cssVar}
                      value={state.customVars?.[color.cssVar] || ""}
                      onChange={(cssVar, val) => setCustomVar(cssVar, val)}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>

      {/* Arredondamento dos Cantos (Radius) */}
      <Section
        title="Arredondamento dos Cantos (Radius)"
        hint={`Raio actual da interface: ${state.radius.toFixed(3)}rem`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {radiusOptions.map((opt) => {
              const isSelected = Math.abs(parseFloat(opt.value) - state.radius) < 0.01;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set({ radius: parseFloat(opt.value) })}
                  className={cn(
                    "rounded-xl border py-2 text-center text-xs font-semibold transition-all cursor-pointer",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary-strong shadow-xs ring-1 ring-primary"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            <Slider
              value={[state.radius]}
              min={0}
              max={1.5}
              step={0.125}
              onValueChange={(v) => set({ radius: v[0] ?? 0.875 })}
              aria-label="Arredondamento dos cantos"
            />
          </div>
        </div>
      </Section>

      {/* Botão de Restaurar Padrão */}
      <div className="pt-2 flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={reset} className="gap-2 text-xs">
          <RotateCcw className="size-3.5" />
          Restaurar padrão SIGA
        </Button>
        <span className="text-[11px] text-muted-foreground">Guardado automaticamente</span>
      </div>

      {/* Modal de Importação */}
      <ImportThemeModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImport={(importedData) => applyImportedTheme(importedData)}
      />
    </div>
  );
}
