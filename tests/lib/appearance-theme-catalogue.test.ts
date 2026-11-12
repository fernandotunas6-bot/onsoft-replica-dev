/**
 * @vitest-environment jsdom
 *
 * O catálogo de temas Shadcn/Tweakcn (cerca de 110 KB) saiu do arranque e passou a
 * carregar sob demanda. Estes testes fixam o que não pode mudar com isso: quem tem
 * um tema de catálogo escolhido continua a recebê-lo, a precedência das camadas
 * mantém-se, e um catálogo que chegue tarde não escreve o estado antigo.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { applyAppearance } from "@/lib/appearance";
import { colorThemes, tweakcnThemes } from "@/config/theme-data";

const base = {
  mode: "light" as const,
  accent: "violeta",
  sidebar: "tinta",
  radius: 0.875,
  density: "comfortable" as const,
  shadcnTheme: "",
  tweakcnTheme: "",
  importedTheme: null,
  customVars: {},
  schoolBrand: null,
  preferPersonalAccent: false,
};

/** O catálogo entra por `import()`: basta esgotar a fila de microtarefas. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function cssVar(name: string) {
  return document.documentElement.style.getPropertyValue(name);
}

describe("aparência sem o catálogo no arranque", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
  });

  it("aplica as camadas que não dependem do catálogo sem esperar por ele", () => {
    applyAppearance({ ...base, radius: 1.25 });
    // Síncrono, no mesmo turno: não há espera por rede para o essencial.
    expect(cssVar("--radius")).toBe("1.25rem");
    expect(document.documentElement.dataset["density"]).toBe("comfortable");
  });

  it("um tema Tweakcn escolhido continua a ser aplicado", async () => {
    const theme = tweakcnThemes[0]!;
    const [varName, expected] = Object.entries(theme.preset.styles.light).find(([, v]) =>
      Boolean(v),
    )!;
    applyAppearance({ ...base, tweakcnTheme: theme.value, preferPersonalAccent: true });
    await settle();
    expect(cssVar(varName.startsWith("--") ? varName : `--${varName}`)).toBe(expected);
  });

  it("um tema Shadcn escolhido continua a ser aplicado", async () => {
    const theme = colorThemes[0]!;
    const [varName, expected] = Object.entries(theme.preset.styles.light).find(([, v]) =>
      Boolean(v),
    )!;
    applyAppearance({ ...base, shadcnTheme: theme.value, preferPersonalAccent: true });
    await settle();
    expect(cssVar(varName.startsWith("--") ? varName : `--${varName}`)).toBe(expected);
  });

  it("o raio e as sobrescritas manuais vencem o catálogo que chega depois", async () => {
    const theme = tweakcnThemes[0]!;
    applyAppearance({
      ...base,
      tweakcnTheme: theme.value,
      radius: 0.25,
      customVars: { "--primary": "oklch(0.5 0.1 200)" },
    });
    await settle();
    expect(cssVar("--radius")).toBe("0.25rem");
    expect(cssVar("--primary")).toBe("oklch(0.5 0.1 200)");
  });

  it("um estado novo substitui o anterior mesmo com o catálogo a caminho", async () => {
    const theme = tweakcnThemes[0]!;
    const [varName] = Object.entries(theme.preset.styles.light).find(([, v]) => Boolean(v))!;
    const name = varName.startsWith("--") ? varName : `--${varName}`;
    // Pede o tema e, no mesmo turno, desiste dele: o catálogo não deve repor nada.
    applyAppearance({ ...base, tweakcnTheme: theme.value, preferPersonalAccent: true });
    applyAppearance({ ...base, radius: 2 });
    await settle();
    expect(cssVar("--radius")).toBe("2rem");
    expect(cssVar(name)).toBe("");
  });
});
