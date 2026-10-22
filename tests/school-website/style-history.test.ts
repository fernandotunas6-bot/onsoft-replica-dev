import { describe, expect, it } from "vitest";
import {
  createStyleHistory,
  recordStyleHistory,
  moveStyleHistory,
} from "@/features/school-website/style-history";
import { parseWebsiteDesign } from "../../painel/escolas/src/design.mjs";
const theme = (activeTheme = "campus") => parseWebsiteDesign({ activeTheme });
describe("histórico visual da sessão", () => {
  it("permite desfazer até um rascunho anterior sem tema e refazer a escolha", () => {
    const design = theme(),
      recorded = recordStyleHistory(createStyleHistory(undefined), undefined, design);
    const undone = moveStyleHistory(recorded, design, "undo")!;
    expect(undone.design).toBeUndefined();
    expect(undone.history.future).toHaveLength(1);
    const redone = moveStyleHistory(undone.history, undone.design, "redo")!;
    expect(redone.design).toEqual(design);
    expect(moveStyleHistory(redone.history, redone.design, "redo")).toBeNull();
  });
  it("guarda até vinte passos e recupera a sequência pela ordem correcta", () => {
    let design = theme(),
      history = createStyleHistory(design);
    for (let index = 1; index <= 25; index++) {
      const next = { ...design, overrides: { primary: "#" + index.toString(16).padStart(6, "0") } };
      history = recordStyleHistory(history, design, next);
      design = next;
    }
    expect(history.past).toHaveLength(20);
    for (let index = 0; index < 20; index++) {
      const step = moveStyleHistory(history, design, "undo")!;
      design = step.design!;
      history = step.history;
    }
    expect(design.overrides.primary).toBe("#000005");
    expect(moveStyleHistory(history, design, "undo")).toBeNull();
    for (let index = 0; index < 20; index++) {
      const step = moveStyleHistory(history, design, "redo")!;
      design = step.design!;
      history = step.history;
    }
    expect(design.overrides.primary).toBe("#000019");
  });
  it("ignora escolhas sem mudança, limpa o refazer após nova edição e conserva cópias independentes", () => {
    const a = theme(),
      b = theme("editorial"),
      history = recordStyleHistory(createStyleHistory(a), a, b);
    expect(recordStyleHistory(history, b, b)).toBe(history);
    a.overrides.buttonShape = "pill";
    const undone = moveStyleHistory(history, b, "undo")!;
    expect(undone.design?.overrides).toEqual({});
    const next = recordStyleHistory(undone.history, undone.design, theme("minimal"));
    expect(next.future).toHaveLength(0);
  });
  it("recusa histórico de uma configuração substituída externamente e inicia uma sequência nova", () => {
    const a = theme(),
      b = theme("editorial"),
      external = theme("minimal");
    const history = recordStyleHistory(createStyleHistory(a), a, b);
    expect(moveStyleHistory(history, external, "undo")).toBeNull();
    const next = recordStyleHistory(history, external, a);
    expect(next.past).toEqual([external]);
    expect(next.future).toEqual([]);
  });
});
