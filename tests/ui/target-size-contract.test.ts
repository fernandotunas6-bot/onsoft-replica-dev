import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de alvo de toque dos componentes universais (fase 2.3 e 4.3 do
 * VISUAL_MASTER_2026). Mede a altura declarada em píxeis reais e exige o
 * mínimo de 24x24px da SC 2.5.8 da WCAG 2.2, que é AA.
 *
 * A raiz tipográfica é 75% (12px) abaixo de 1024px e 71,875% (11,5px) acima
 * (src/styles.css), logo toda a escala `rem` do Tailwind está ~25% abaixo do
 * nominal: `h-11` são 33px, não 44. Medir em rem dá valores errados.
 *
 * Um controlo abaixo de 24px passa se compensar com área de toque em
 * pseudo-elemento, que não ocupa espaço no layout nem altera o tamanho visual.
 */

const RAIZ = { movel: 12, desktop: 11.5 };
const MINIMO_AA = 24;

const REM: Record<string, number> = {
  "h-3": 0.75,
  "h-3.5": 0.875,
  "h-4": 1,
  "h-5": 1.25,
  "h-6": 1.5,
  "h-7": 1.75,
  "h-8": 2,
  "h-9": 2.25,
  "h-10": 2.5,
  "h-11": 2.75,
  "h-12": 3,
  "h-14": 3.5,
  "min-h-8": 2,
  "min-h-9": 2.25,
  "min-h-10": 2.5,
  "min-h-11": 2.75,
};

function fonte(caminho: string): string {
  return readFileSync(resolve(__dirname, "../../src/components", caminho), "utf8");
}

/** Altura declarada para um prefixo de variante ("" base, "lg:" desktop). */
function altura(classes: string, prefixo: string): { px?: number; rem?: number } | null {
  const p = prefixo.replace(":", "\\:");
  const explicito = classes.match(new RegExp(`(?:^| )${p}(?:min-)?h-\\[(\\d+)px\\]`));
  if (explicito) return { px: Number(explicito[1]) };
  for (const [classe, rem] of Object.entries(REM)) {
    if (new RegExp(`(?:^| )${p}${classe.replace(".", "\\.")}(?= |$)`).test(classes)) {
      return { rem };
    }
  }
  return null;
}

const emPx = (a: { px?: number; rem?: number } | null, raiz: number) =>
  a === null ? null : a.px !== undefined ? a.px : a.rem! * raiz;

/** Área de toque em pseudo-elemento com pelo menos 24px nas duas dimensões. */
function temAreaDeToque(classes: string): boolean {
  if (!/(?:^| )relative(?= |$)/.test(classes)) return false;
  if (!/before:absolute/.test(classes)) return false;
  const size = classes.match(/before:size-\[(\d+)px\]/);
  if (size) return Number(size[1]) >= MINIMO_AA;
  const h = classes.match(/before:h-\[(\d+)px\]/);
  const w = classes.match(/before:w-\[(\d+)px\]/);
  return !!h && !!w && Number(h[1]) >= MINIMO_AA && Number(w[1]) >= MINIMO_AA;
}

/** [ficheiro, nome, âncora da classe raiz] */
const CONTROLOS: Array<[string, string, RegExp]> = [
  ["ui/checkbox.tsx", "caixa de verificação", /"(grid place-content-center peer[^"]*)"/],
  ["ui/radio-group.tsx", "opção de rádio", /"(aspect-square h-4 w-4[^"]*)"/],
  ["ui/switch.tsx", "interruptor", /"(peer inline-flex h-5 w-9[^"]*)"/],
  ["ui/tabs.tsx", "aba", /"([^"]*min-h-9[^"]*)"/],
  ["ui/pagination.tsx", "botão de página", /"([^"]*\bh-9\b[^"]*)"/],
  ["ui/input.tsx", "campo de texto", /"(flex h-\[44px\][^"]*)"/],
  ["ui/select.tsx", "selector (gatilho)", /"(flex h-\[44px\][^"]*)"/],
  ["ui/textarea.tsx", "área de texto", /"(flex min-h-\[96px\][^"]*)"/],
];

/** Isenções com razão escrita. */
const ISENTOS: Record<string, string> = {
  "dia do calendário":
    "não é mensurável estaticamente: o botão do dia usa `aspect-square h-full " +
    "w-full` e recebe a dimensão da célula da grelha, que depende da largura do " +
    "contentor. Exige medição em runtime, registada como pendente na fase 2.3.",
};

describe("alvo de toque dos componentes universais", () => {
  for (const [ficheiro, nome, ancora] of CONTROLOS) {
    it(`${nome} — pelo menos ${MINIMO_AA}px nas duas larguras`, () => {
      const texto = fonte(ficheiro);
      const encontrado = texto.match(ancora);
      expect(encontrado, `classe raiz de ${nome} não encontrada em ${ficheiro}`).toBeTruthy();
      const classes = encontrado![1];

      const base = altura(classes, "");
      const lg = altura(classes, "lg:");
      const movel = emPx(base, RAIZ.movel);
      const desktop = emPx(lg, RAIZ.desktop) ?? emPx(base, RAIZ.desktop);
      expect(movel ?? desktop, `${nome} não declara altura`).not.toBeNull();

      const menor = Math.min(movel ?? Infinity, desktop ?? Infinity);
      if (menor >= MINIMO_AA) return;

      expect(
        temAreaDeToque(classes),
        `${nome} declara ${menor.toFixed(1)}px (abaixo de ${MINIMO_AA}px da SC 2.5.8) ` +
          `e não compensa com área de toque em pseudo-elemento de ${MINIMO_AA}px`,
      ).toBe(true);
    });
  }

  it("toda a isenção tem razão escrita", () => {
    for (const [nome, razao] of Object.entries(ISENTOS)) {
      expect(razao.length, `isenção ${nome} sem razão suficiente`).toBeGreaterThan(60);
    }
  });
});
