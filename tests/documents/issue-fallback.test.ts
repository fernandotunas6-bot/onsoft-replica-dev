import { beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
const printed = vi.fn();

vi.mock("@/features/documents/server", () => ({
  listPrintTemplates: async () => ({ byType: {} }),
  getPrintTemplate: async () => ({ source: "<p>{{document.hash}}</p>", css: "" }),
}));
vi.mock("@/features/school/server", () => ({
  getSchoolSettings: async () => ({ name: "Escola" }),
}));
vi.mock("@/features/documents/verification", () => ({ registerIssuedDocument: register }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64," } }));
vi.mock("@/lib/print-html", () => ({ printOfficialHtml: (html: string) => printed(html) }));

const { issuePrintDocument } = await import("@/features/documents/print-issue");

const input = (fallback: () => void) => ({
  tipo: "Talão de matrícula",
  school: { name: "Escola" },
  student: { fullName: "Ana Ferreira", academicNumber: "1", documentTitle: "M-1" },
  fallback,
});

describe("alternativa da emissão oficial", () => {
  beforeEach(() => {
    register.mockReset();
    printed.mockReset();
  });

  it("registo recusado: o erro chega a quem emitiu e nada se imprime", async () => {
    register.mockRejectedValue(new Error("A escola está bloqueada."));
    const fallback = vi.fn();
    await expect(issuePrintDocument(input(fallback))).rejects.toThrow("A escola está bloqueada.");
    expect(fallback).not.toHaveBeenCalled();
    expect(printed).not.toHaveBeenCalled();
  });

  it("registo aceite: imprime com o código", async () => {
    register.mockResolvedValue({ code: "SIGA-ABCD-2345" });
    const fallback = vi.fn();
    await issuePrintDocument(input(fallback));
    expect(fallback).not.toHaveBeenCalled();
    expect(printed.mock.calls[0]![0]).toContain("SIGA-ABCD-2345");
  });
});
