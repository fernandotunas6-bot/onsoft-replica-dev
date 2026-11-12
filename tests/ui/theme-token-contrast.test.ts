import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de contraste dos tokens de tema (Fase 2.2 do VISUAL_MASTER_2026).
 * Mede os pares semânticos declarados em src/styles.css contra WCAG 2.2 AA:
 * 4,5:1 para texto corrente e 3:1 para componentes e séries de gráfico.
 *
 * Qualquer par que falhe tem de constar de PARES_ISENTOS com razão escrita.
 */

const CSS = readFileSync(resolve(__dirname, "../../src/styles.css"), "utf8");

type Oklch = { L: number; C: number; H: number; alpha: number };

function lerBloco(selector: string): Record<string, string> {
  const inicio = CSS.indexOf(`\n${selector} {`);
  if (inicio === -1) throw new Error(`bloco ${selector} não encontrado em styles.css`);
  const fim = CSS.indexOf("\n}", inicio);
  const tokens: Record<string, string> = {};
  for (const linha of CSS.slice(inicio, fim).split("\n")) {
    const m = linha.match(/^\s*(--[\w-]+)\s*:\s*(.+?);\s*$/);
    if (m) tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

function parseOklch(valor: string): Oklch | null {
  const m = valor.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%?\s*)?\)$/);
  if (!m) return null;
  const alphaRaw = m[4];
  return {
    L: Number(m[1]),
    C: Number(m[2]),
    H: Number(m[3]),
    alpha:
      alphaRaw === undefined ? 1 : valor.includes("%") ? Number(alphaRaw) / 100 : Number(alphaRaw),
  };
}

function oklchParaSrgb({ L, C, H }: Oklch): number[] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const codificar = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return linear.map((c) => Math.min(1, Math.max(0, codificar(c))));
}

const paraLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const luminancia = (rgb: number[]) =>
  0.2126 * paraLinear(rgb[0]) + 0.7152 * paraLinear(rgb[1]) + 0.0722 * paraLinear(rgb[2]);

function razao(frente: number[], fundo: number[]): number {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  const [alto, baixo] = a > b ? [a, b] : [b, a];
  return (alto + 0.05) / (baixo + 0.05);
}

function cor(tokens: Record<string, string>, nome: string, sobre?: number[]): number[] {
  const valor = tokens[nome];
  expect(valor, `token ${nome} ausente`).toBeTruthy();
  const parsed = parseOklch(valor);
  expect(parsed, `token ${nome} não é oklch(): ${valor}`).toBeTruthy();
  const rgb = oklchParaSrgb(parsed!);
  if (parsed!.alpha >= 1 || !sobre) return rgb;
  return rgb.map((c, i) => c * parsed!.alpha + sobre[i] * (1 - parsed!.alpha));
}

/** [frente, fundo, limite, descrição] */
const PARES: Array<[string, string, number, string]> = [
  ["--foreground", "--background", 4.5, "texto corrente na página"],
  ["--card-foreground", "--card", 4.5, "texto em cartão"],
  ["--popover-foreground", "--popover", 4.5, "texto em popover"],
  ["--muted-foreground", "--background", 4.5, "texto secundário na página"],
  ["--muted-foreground", "--card", 4.5, "texto secundário em cartão"],
  ["--muted-foreground", "--muted", 4.5, "texto secundário em superfície muted"],
  ["--secondary-foreground", "--secondary", 4.5, "botão secundário"],
  ["--primary-foreground", "--primary", 4.5, "botão primário"],
  ["--accent-foreground", "--accent", 4.5, "estado accent / item activo"],
  ["--destructive-foreground", "--destructive", 4.5, "botão e etiqueta destrutivos"],
  ["--destructive-foreground", "--destructive-hover", 4.5, "hover destrutivo opaco"],
  ["--destructive-strong", "--background", 4.5, "texto destrutivo na página"],
  ["--success-foreground", "--success", 4.5, "etiqueta de sucesso"],
  ["--warning-foreground", "--warning", 4.5, "etiqueta de aviso"],
  ["--info-foreground", "--info", 4.5, "etiqueta de informação"],
  ["--primary-strong", "--background", 4.5, "texto primário na página"],
  ["--primary-strong", "--card", 4.5, "texto primário em cartão"],
  ["--success-strong", "--card", 4.5, "texto de sucesso em cartão"],
  ["--warning-strong", "--card", 4.5, "texto de aviso em cartão"],
  ["--info-strong", "--card", 4.5, "texto de informação em cartão"],
  ["--destructive-strong", "--card", 4.5, "texto destrutivo em cartão"],
  ["--chart-2-strong", "--card", 4.5, "texto da série 2 em cartão"],
  ["--sidebar-foreground", "--sidebar", 4.5, "texto da sidebar"],
  ["--sidebar-muted", "--sidebar", 4.5, "texto secundário da sidebar"],
  ["--sidebar-accent-foreground", "--sidebar-accent", 4.5, "item activo da sidebar"],
  ["--sidebar-active", "--sidebar", 4.5, "destaque do item activo"],
  ["--sidebar-primary-foreground", "--sidebar-primary", 4.5, "botão primário na sidebar"],
  ["--primary", "--background", 3, "elemento primário na página"],
  ["--ring", "--background", 3, "anel de foco na página"],
  ["--ring", "--card", 3, "anel de foco em cartão"],
  ["--sidebar-ring", "--sidebar", 3, "anel de foco na sidebar"],
  ["--chart-1", "--card", 3, "série 1 do gráfico"],
  ["--chart-2", "--card", 3, "série 2 do gráfico"],
  ["--chart-3", "--card", 3, "série 3 do gráfico"],
  ["--chart-4", "--card", 3, "série 4 do gráfico"],
  ["--chart-5", "--card", 3, "série 5 do gráfico"],
  ["--input", "--background", 3, "contorno de campo sobre a página"],
  ["--input", "--card", 3, "contorno de campo sobre cartão"],
  ["--border", "--background", 3, "borda sobre a página"],
  ["--border", "--card", 3, "borda sobre cartão"],
  ["--sidebar-border", "--sidebar", 3, "separador da sidebar"],
];

/**
 * Isenções com razão escrita. Só entram aqui pares cuja falha não constitui
 * falha de WCAG 1.4.11, ou que aguardam decisão registada do proprietário.
 */
const PARES_ISENTOS: Record<string, string> = {
  "--border/--background":
    "separador decorativo: a superfície é identificada pelo próprio fundo, " +
    "não pela borda. 1.4.11 não exige 3:1 para limites decorativos.",
  "--border/--card":
    "idem — borda subtil de cartão exigida pelo contrato («bordas finas e separadores subtis»).",
  "--sidebar-border/--sidebar":
    "idem — separador interno da sidebar, não delimita componente accionável.",
};

describe("contraste dos tokens de tema", () => {
  for (const [nomeTema, selector] of [
    ["claro", ":root"],
    ["escuro", ".dark"],
  ] as const) {
    describe(`tema ${nomeTema}`, () => {
      const tokens = lerBloco(selector === ":root" ? ":root" : ".dark");

      for (const [frente, fundo, limite, descricao] of PARES) {
        const chave = `${frente}/${fundo}`;
        const isento = PARES_ISENTOS[chave];
        const titulo = `${descricao} — ${frente} sobre ${fundo} ≥ ${limite}:1`;

        if (isento) {
          it.skip(`${titulo} (isento: ${isento.slice(0, 48)}…)`, () => {});
          continue;
        }

        it(titulo, () => {
          const corFundo = cor(tokens, fundo);
          const corFrente = cor(tokens, frente, corFundo);
          expect(razao(corFrente, corFundo)).toBeGreaterThanOrEqual(limite);
        });
      }
    });
  }

  it("toda a isenção tem razão escrita e corresponde a um par medido", () => {
    const declarados = new Set(PARES.map(([f, b]) => `${f}/${b}`));
    for (const [chave, razaoEscrita] of Object.entries(PARES_ISENTOS)) {
      expect(declarados, `isenção ${chave} não corresponde a nenhum par`).toContain(chave);
      expect(razaoEscrita.length, `isenção ${chave} sem razão suficiente`).toBeGreaterThan(40);
    }
  });
});

// O mesmo preenchimento serve os fundos translúcidos dos avisos e badges.
// Medir o texto real (strong), não o foreground claro do botão sólido.
describe("texto destrutivo em superfícies translúcidas", () => {
  for (const selector of [":root", ".dark"]) {
    const tokens = lerBloco(selector);
    for (const superficie of ["--background", "--card", "--muted"]) {
      for (const alpha of [0, 0.05, 0.1, 0.12, 0.15, 0.2]) {
        it(`${selector}: texto sobre ${superficie}, tinta ${alpha}`, () => {
          const base = cor(tokens, superficie);
          const tinta = cor(tokens, "--destructive");
          const fundo = tinta.map((canal, i) => canal * alpha + base[i] * (1 - alpha));
          expect(razao(cor(tokens, "--destructive-strong"), fundo)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe("consumidores e evidência do tema", () => {
  it("não usa a cor de preenchimento como texto nem dilui o texto de erro", () => {
    const root = resolve(__dirname, "../../src");
    const inseguros = readdirSync(root, { recursive: true })
      .filter((path) => /\.tsx?$/.test(String(path)))
      .filter((path) =>
        /\btext-destructive(?![\w-])|\btext-destructive-strong\//.test(
          readFileSync(resolve(root, String(path)), "utf8"),
        ),
      );
    expect(inseguros).toEqual([]);
  });

  it("a evidência tipográfica inclui os mínimos px definidos no tema", () => {
    const prova = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../docs/design/evidence/2026-10-30/typography-scale.json"),
        "utf8",
      ),
    );
    for (const linha of prova.render_px_depois) {
      for (const nome of ["text-xs", "text-sm", "text-base", "text-lg"]) {
        const m = CSS.match(new RegExp(`--${nome}: max\\(([\\d.]+)px, ([\\d.]+)rem\\)`));
        expect(m, `escala ${nome} ausente`).toBeTruthy();
        expect(linha[nome]).toBe(Math.max(Number(m![1]), Number(m![2]) * linha.raiz_px));
      }
    }
  });
});

describe("hover destrutivo dos consumidores", () => {
  // Estas variantes têm texto destructive-foreground. Os hovers ghost com
  // tinta /10 usam texto strong e são cobertos pelos pares translúcidos acima.
  const candidatos = new Set(
    ["button.tsx", "badge.tsx"].flatMap(
      (path) =>
        readFileSync(resolve(__dirname, "../../src/components/ui", path), "utf8").match(
          /hover:bg-destructive(?:-[\w]+)?(?:\/\d+)?/g,
        ) ?? [],
    ),
  );
  for (const selector of [":root", ".dark"]) {
    for (const superficie of ["--background", "--card"]) {
      it(`${selector}: hover com texto claro sobre ${superficie}`, () => {
        expect(candidatos.size).toBeGreaterThan(0);
        const tokens = lerBloco(selector);
        for (const candidato of candidatos) {
          const [nome, opacidade] = candidato.replace("hover:bg-", "").split("/");
          const alpha = opacidade ? Number(opacidade) / 100 : 1;
          const base = cor(tokens, superficie);
          const tinta = cor(tokens, `--${nome}`);
          const fundo = tinta.map((c, i) => c * alpha + base[i] * (1 - alpha));
          expect(
            razao(cor(tokens, "--destructive-foreground"), fundo),
            candidato,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

// Mede os pares que os componentes de aluno realmente declaram, incluindo a
// tinta e o fundo subjacente; o foreground de um badge sólido não serve aqui.
describe("etiquetas académicas e financeiras dos alunos", () => {
  for (const [ficheiro, mapa] of [
    ["src/features/students/components/StudentFinanceBadge.tsx", "financeTones"],
    ["src/features/students/components/StudentStatusBadge.tsx", "statusTones"],
    ["src/routes/alunos/index.tsx", "pagamentoTone"],
  ]) {
    const codigo = readFileSync(resolve(__dirname, "../..", ficheiro), "utf8");
    const corpo = codigo.match(new RegExp(`const ${mapa}:[\\s\\S]*?= \\{([\\s\\S]*?)\\n\\};`))?.[1];
    if (!corpo) throw new Error(`Mapa ${mapa} não encontrado`);
    const estados = [...corpo.matchAll(/\b(\w+): "([^"]+)"/g)];
    if (!estados.length) throw new Error(`Mapa ${mapa} vazio`);
    for (const [, estado, classes] of estados) {
      for (const selector of [":root", ".dark"]) {
        for (const superficie of ["--background", "--card"]) {
          it(`${mapa}.${estado} / ${selector} sobre ${superficie}`, () => {
            const tokens = lerBloco(selector);
            const texto = classes.match(/\btext-([\w-]+)/)?.[1];
            const fundo = classes.match(/\bbg-([\w-]+)(?:\/(\d+))?/);
            expect(texto).toBeTruthy();
            expect(fundo).toBeTruthy();
            const alpha = fundo![2] ? Number(fundo![2]) / 100 : 1;
            const base = cor(tokens, superficie);
            const tinta = cor(tokens, `--${fundo![1]}`);
            const composto = tinta.map((c, i) => c * alpha + base[i] * (1 - alpha));
            expect(razao(cor(tokens, `--${texto}`), composto), classes).toBeGreaterThanOrEqual(4.5);
          });
        }
      }
    }
  }
});
