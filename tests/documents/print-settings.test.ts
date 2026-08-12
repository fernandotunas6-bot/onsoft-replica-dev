import { describe, expect, it } from "vitest";
import { parsePrintSettings } from "@/features/documents/print-settings";

describe("parsePrintSettings", () => {
  it("devolve vazio para valores inválidos", () => {
    expect(parsePrintSettings(null)).toEqual({});
    expect(parsePrintSettings(undefined)).toEqual({});
    expect(parsePrintSettings("texto")).toEqual({});
  });

  it("filtra overrides e byType para strings", () => {
    expect(
      parsePrintSettings({
        issue: "boletim-escolar",
        overrides: {
          "boletim-escolar": "<section>ok</section>",
          invalid: 42,
        },
        byType: {
          report_card: "boletim-escolar",
          broken: null,
        },
      }),
    ).toEqual({
      issue: "boletim-escolar",
      overrides: { "boletim-escolar": "<section>ok</section>" },
      byType: { report_card: "boletim-escolar" },
    });
  });

  it("ignora issue que não é string", () => {
    expect(parsePrintSettings({ issue: 1 })).toEqual({
      overrides: {},
      byType: {},
    });
  });
});
