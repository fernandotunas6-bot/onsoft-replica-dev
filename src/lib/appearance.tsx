import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { colorThemes, tweakcnThemes } from "@/config/theme-data";
import type { ImportedTheme, ThemePreset } from "@/types/theme-customizer";
import { brandHexToCssVars, type SchoolBrandColors } from "@/lib/brand-tokens";

/**
 * Aparência e personalização visual completa do SIGA.
 * Suporta modo, presets nativos SIGA, temas Shadcn, temas Tweakcn,
 * cores da marca customizadas, branding institucional da escola e importação de CSS.
 */

export type ThemeMode = "light" | "dark" | "system";

export type UiDensity = "compact" | "comfortable" | "spacious";

export const densityPresets: Array<{ id: UiDensity; label: string; hint: string }> = [
  { id: "compact", label: "Compacta", hint: "Mais linhas nas tabelas e menos espaço" },
  { id: "comfortable", label: "Confortável", hint: "Equilíbrio para uso diário" },
  { id: "spacious", label: "Ampla", hint: "Mais espaço e toques maiores" },
];

export type AccentPreset = {
  id: string;
  label: string;
  hue: number;
  chroma: number;
  /** Amostra apresentada na UI de configurações. */
  swatch: string;
};

export const accentPresets: AccentPreset[] = [
  {
    id: "violeta",
    label: "Violeta",
    hue: 292.5,
    chroma: 0.235,
    swatch: "oklch(0.556 0.235 292.5)",
  },
  { id: "indigo", label: "Índigo", hue: 268, chroma: 0.208, swatch: "oklch(0.556 0.208 268)" },
  { id: "oceano", label: "Oceano", hue: 240, chroma: 0.16, swatch: "oklch(0.566 0.16 240)" },
  {
    id: "esmeralda",
    label: "Esmeralda",
    hue: 162,
    chroma: 0.145,
    swatch: "oklch(0.566 0.145 162)",
  },
  { id: "ambar", label: "Âmbar", hue: 71, chroma: 0.155, swatch: "oklch(0.646 0.155 71)" },
  { id: "coral", label: "Coral", hue: 25, chroma: 0.185, swatch: "oklch(0.606 0.185 25)" },
  { id: "rosa", label: "Rosa", hue: 340, chroma: 0.19, swatch: "oklch(0.586 0.19 340)" },
  { id: "grafite", label: "Grafite", hue: 285, chroma: 0.03, swatch: "oklch(0.46 0.03 285)" },
];

export type SidebarPreset = {
  id: string;
  label: string;
  swatch: string;
  /** Tokens do sidebar; se ausente, usa a cor de destaque. */
  vars?: Record<string, string>;
  /** Usa o mesmo matiz da cor de destaque escolhida. */
  fromAccent?: boolean;
};

export const sidebarPresets: SidebarPreset[] = [
  {
    id: "tinta",
    label: "Tinta (padrão)",
    swatch: "oklch(0.204 0.024 285)",
    vars: {
      "--sidebar": "oklch(0.204 0.024 285)",
      "--sidebar-foreground": "oklch(0.955 0.006 286)",
      "--sidebar-muted": "oklch(0.652 0.018 286)",
      "--sidebar-accent": "oklch(0.268 0.028 285)",
      "--sidebar-accent-foreground": "oklch(0.975 0.005 286)",
      "--sidebar-border": "oklch(0.288 0.026 285)",
    },
  },
  {
    id: "carvao",
    label: "Carvão",
    swatch: "oklch(0.18 0 0)",
    vars: {
      "--sidebar": "oklch(0.18 0 0)",
      "--sidebar-foreground": "oklch(0.96 0 0)",
      "--sidebar-muted": "oklch(0.66 0 0)",
      "--sidebar-accent": "oklch(0.26 0 0)",
      "--sidebar-accent-foreground": "oklch(0.98 0 0)",
      "--sidebar-border": "oklch(0.3 0 0)",
    },
  },
  {
    id: "marinho",
    label: "Marinho",
    swatch: "oklch(0.24 0.055 255)",
    vars: {
      "--sidebar": "oklch(0.24 0.055 255)",
      "--sidebar-foreground": "oklch(0.96 0.008 255)",
      "--sidebar-muted": "oklch(0.74 0.03 255)",
      "--sidebar-accent": "oklch(0.3 0.06 255)",
      "--sidebar-accent-foreground": "oklch(0.98 0.008 255)",
      "--sidebar-border": "oklch(0.33 0.055 255)",
    },
  },
  {
    id: "floresta",
    label: "Floresta",
    swatch: "oklch(0.26 0.05 162)",
    vars: {
      "--sidebar": "oklch(0.26 0.05 162)",
      "--sidebar-foreground": "oklch(0.96 0.01 162)",
      "--sidebar-muted": "oklch(0.72 0.03 162)",
      "--sidebar-accent": "oklch(0.32 0.055 162)",
      "--sidebar-accent-foreground": "oklch(0.98 0.01 162)",
      "--sidebar-border": "oklch(0.35 0.05 162)",
    },
  },
  {
    id: "destaque",
    label: "Cor de destaque",
    swatch: "oklch(0.3 0.11 292.5)",
    fromAccent: true,
  },
  {
    id: "claro",
    label: "Claro",
    swatch: "oklch(0.98 0.004 285)",
    vars: {
      "--sidebar": "oklch(0.985 0.004 285)",
      "--sidebar-foreground": "oklch(0.24 0.02 285)",
      "--sidebar-muted": "oklch(0.52 0.02 286)",
      "--sidebar-accent": "oklch(0.945 0.008 286)",
      "--sidebar-accent-foreground": "oklch(0.24 0.02 285)",
      "--sidebar-border": "oklch(0.9 0.008 286)",
    },
  },
];

export type AppearanceState = {
  mode: ThemeMode;
  accent: string;
  sidebar: string;
  radius: number;
  density: UiDensity;
  /** Tema Shadcn ativo (ex: 'blue', 'green', ou vazio se usa SIGA nativo) */
  shadcnTheme?: string;
  /** Tema Tweakcn ativo (ex: 'modern-minimal', 'neon', ou vazio) */
  tweakcnTheme?: string;
  /** Tema importado via CSS customizado */
  importedTheme?: ImportedTheme | null;
  /** Sobrescritas manuais de variáveis de cor da marca */
  customVars?: Record<string, string>;
  /**
   * Cores institucionais da escola (não persistidas em localStorage —
   * injectadas a partir de `school_branding`).
   */
  schoolBrand?: SchoolBrandColors | null;
  /**
   * Quando true, os presets pessoais do dispositivo prevalecem sobre a marca da escola.
   */
  preferPersonalAccent?: boolean;
};

const STORAGE_KEY = "siga:appearance";

const defaults: AppearanceState = {
  mode: "light",
  accent: "violeta",
  sidebar: "tinta",
  radius: 0.875,
  density: "comfortable",
  shadcnTheme: "",
  tweakcnTheme: "",
  importedTheme: null,
  customVars: {},
  schoolBrand: null,
  preferPersonalAccent: false,
};

function accentById(id: string) {
  return accentPresets.find((p) => p.id === id) ?? accentPresets[0]!;
}

function sidebarById(id: string) {
  return sidebarPresets.find((p) => p.id === id) ?? sidebarPresets[0]!;
}

/** Limpa todas as propriedades CSS customizadas inline do documento. */
export function resetCustomCssProperties() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const inlineStyles = root.style;
  for (let i = inlineStyles.length - 1; i >= 0; i--) {
    const property = inlineStyles[i];
    if (property && property.startsWith("--")) {
      root.style.removeProperty(property);
    }
  }
}

/** Tokens derivados de um matiz, para modo claro e escuro. */
function accentVars(preset: AccentPreset, dark: boolean) {
  const { hue: h, chroma: c } = preset;
  if (dark) {
    return {
      "--primary": `oklch(0.652 ${c * 0.9} ${h})`,
      "--primary-foreground": `oklch(0.16 0.03 ${h})`,
      "--primary-soft": `oklch(0.288 ${c * 0.28} ${h})`,
      "--primary-strong": `oklch(0.792 ${c * 0.62} ${h})`,
      "--accent": `oklch(0.298 ${c * 0.24} ${h})`,
      "--accent-foreground": `oklch(0.925 ${c * 0.18} ${h})`,
      "--ring": `oklch(0.652 ${c * 0.9} ${h})`,
      "--chart-1": `oklch(0.652 ${c * 0.9} ${h})`,
    };
  }
  return {
    "--primary": `oklch(0.556 ${c} ${h})`,
    "--primary-foreground": `oklch(0.99 0.005 ${h})`,
    "--primary-soft": `oklch(0.951 ${c * 0.12} ${h})`,
    "--primary-strong": `oklch(0.452 ${c * 0.88} ${h})`,
    "--accent": `oklch(0.951 ${c * 0.12} ${h})`,
    "--accent-foreground": `oklch(0.42 ${c * 0.82} ${h})`,
    "--ring": `oklch(0.556 ${c} ${h})`,
    "--chart-1": `oklch(0.556 ${c} ${h})`,
  };
}

function sidebarVars(sidebar: SidebarPreset, accent: AccentPreset) {
  const { hue: h, chroma: c } = accent;
  const base = sidebar.fromAccent
    ? {
        "--sidebar": `oklch(0.24 ${c * 0.42} ${h})`,
        "--sidebar-foreground": `oklch(0.965 0.01 ${h})`,
        "--sidebar-muted": `oklch(0.74 ${c * 0.16} ${h})`,
        "--sidebar-accent": `oklch(0.31 ${c * 0.46} ${h})`,
        "--sidebar-accent-foreground": `oklch(0.98 0.01 ${h})`,
        "--sidebar-border": `oklch(0.35 ${c * 0.4} ${h})`,
      }
    : (sidebar.vars ?? {});

  const light = sidebar.id === "claro";
  return {
    ...base,
    "--sidebar-primary": `oklch(${light ? 0.556 : 0.72} ${light ? c : c * 0.72} ${h})`,
    "--sidebar-primary-foreground": light ? `oklch(0.99 0.005 ${h})` : `oklch(0.16 0.03 ${h})`,
    "--sidebar-ring": `oklch(0.652 ${c * 0.9} ${h})`,
    "--sidebar-active": `oklch(${light ? 0.452 : 0.862} ${c * 0.46} ${h})`,
  };
}

export function applyAppearance(state: AppearanceState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
  const dark = state.mode === "dark" || (state.mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);

  resetCustomCssProperties();

  // 1. Aplica predefinições básicas SIGA
  const accent = accentById(state.accent);
  const vars: Record<string, string> = {
    ...accentVars(accent, dark),
    ...sidebarVars(sidebarById(state.sidebar), accent),
    "--radius": `${state.radius}rem`,
  };

  // 2. Se houver tema Shadcn ativo, aplica as variáveis
  if (state.shadcnTheme) {
    const theme = colorThemes.find((t) => t.value === state.shadcnTheme);
    if (theme) {
      const styles = dark ? theme.preset.styles.dark : theme.preset.styles.light;
      Object.entries(styles).forEach(([k, v]) => {
        if (v) vars[k.startsWith("--") ? k : `--${k}`] = v;
      });
    }
  }

  // 3. Se houver tema Tweakcn ativo, aplica as variáveis
  if (state.tweakcnTheme) {
    const theme = tweakcnThemes.find((t) => t.value === state.tweakcnTheme);
    if (theme) {
      const styles = dark ? theme.preset.styles.dark : theme.preset.styles.light;
      Object.entries(styles).forEach(([k, v]) => {
        if (v) vars[k.startsWith("--") ? k : `--${k}`] = v;
      });
    }
  }

  // 4. Se houver tema importado
  if (state.importedTheme) {
    const styles = dark ? state.importedTheme.dark : state.importedTheme.light;
    Object.entries(styles).forEach(([k, v]) => {
      if (v) vars[k.startsWith("--") ? k : `--${k}`] = v;
    });
  }

  // 5. Marca institucional da escola (se o utilizador não preferiu accent pessoal
  //    e não há tema Shadcn/Tweakcn/importado activo).
  const hasExternalTheme = Boolean(state.shadcnTheme || state.tweakcnTheme || state.importedTheme);
  if (state.schoolBrand?.primary && !state.preferPersonalAccent && !hasExternalTheme) {
    Object.assign(
      vars,
      brandHexToCssVars(state.schoolBrand.primary, state.schoolBrand.secondary, dark),
    );
  }

  // 6. Sobrescrita de variáveis manuais (Custom Brand Colors)
  if (state.customVars && Object.keys(state.customVars).length > 0) {
    Object.entries(state.customVars).forEach(([k, v]) => {
      if (v) vars[k.startsWith("--") ? k : `--${k}`] = v;
    });
  }

  // Garante que o raio escolhido se mantém
  vars["--radius"] = `${state.radius}rem`;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }

  root.dataset["accent"] = state.preferPersonalAccent
    ? state.accent
    : state.schoolBrand?.primary
      ? "school"
      : state.accent;
  root.dataset["sidebarTheme"] = state.sidebar;
  root.dataset["density"] = state.density ?? "comfortable";
}

type AppearanceContextValue = {
  state: AppearanceState;
  isDark: boolean;
  set: (patch: Partial<AppearanceState>) => void;
  reset: () => void;
  toggleDark: (event?: React.MouseEvent) => void;
  applyShadcnTheme: (themeKey: string) => void;
  applyTweakcnTheme: (themeKey: string) => void;
  applyImportedTheme: (theme: ImportedTheme) => void;
  setCustomVar: (cssVar: string, value: string) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppearanceState>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...defaults, ...(JSON.parse(raw) as Partial<AppearanceState>) });
    } catch {
      /* preferências corrompidas: mantém o padrão */
    }
  }, []);

  useEffect(() => {
    applyAppearance(state);
    try {
      const { schoolBrand: _schoolBrand, ...persistable } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
    } catch {
      /* sem armazenamento disponível */
    }
  }, [state]);

  useEffect(() => {
    if (state.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(state);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [state]);

  const set = useCallback((patch: Partial<AppearanceState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const reset = useCallback(() => {
    resetCustomCssProperties();
    setState(defaults);
  }, []);

  const isDark =
    state.mode === "dark" ||
    (state.mode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);

  const toggleDark = useCallback(
    (event?: React.MouseEvent) => {
      const nextMode = (state.mode === "dark" ? "light" : "dark") as ThemeMode;

      if (event && "startViewTransition" in document) {
        const x = (event.clientX / window.innerWidth) * 100;
        const y = (event.clientY / window.innerHeight) * 100;
        document.documentElement.style.setProperty("--x", `${x}%`);
        document.documentElement.style.setProperty("--y", `${y}%`);

        (
          document as Document & {
            startViewTransition: (cb: () => void) => { finished: Promise<void> };
          }
        ).startViewTransition(() => {
          setState((s) => ({ ...s, mode: nextMode }));
        });
      } else {
        setState((s) => ({ ...s, mode: nextMode }));
      }
    },
    [state.mode],
  );

  const applyShadcnTheme = useCallback((themeKey: string) => {
    setState((s) => ({
      ...s,
      shadcnTheme: themeKey,
      tweakcnTheme: "",
      importedTheme: null,
      customVars: {},
      preferPersonalAccent: true,
    }));
  }, []);

  const applyTweakcnTheme = useCallback((themeKey: string) => {
    setState((s) => ({
      ...s,
      tweakcnTheme: themeKey,
      shadcnTheme: "",
      importedTheme: null,
      customVars: {},
      preferPersonalAccent: true,
    }));
  }, []);

  const applyImportedTheme = useCallback((imported: ImportedTheme) => {
    setState((s) => ({
      ...s,
      importedTheme: imported,
      shadcnTheme: "",
      tweakcnTheme: "",
      customVars: {},
      preferPersonalAccent: true,
    }));
  }, []);

  const setCustomVar = useCallback((cssVar: string, value: string) => {
    setState((s) => ({
      ...s,
      customVars: {
        ...(s.customVars ?? {}),
        [cssVar]: value,
      },
    }));
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      state,
      isDark,
      set,
      reset,
      toggleDark,
      applyShadcnTheme,
      applyTweakcnTheme,
      applyImportedTheme,
      setCustomVar,
    }),
    [
      state,
      isDark,
      set,
      reset,
      toggleDark,
      applyShadcnTheme,
      applyTweakcnTheme,
      applyImportedTheme,
      setCustomVar,
    ],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance deve ser usado dentro de <AppearanceProvider>");
  return ctx;
}
