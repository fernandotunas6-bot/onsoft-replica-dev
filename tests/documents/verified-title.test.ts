import { describe, expect, it } from "vitest";
import { verifiedDocumentTitle } from "@/features/documents/verification";

/**
 * O título vinha do browser e a verificação pública confirmava-o: um professor (só
 * pautas e boletins) registava «Certificado de habilitações» com o modelo de pauta.
 */
describe("título mostrado na verificação", () => {
  it("um título de outro modelo dá lugar ao nome do modelo", () => {
    expect(verifiedDocumentTitle("pauta-disciplinar", "Certificado de habilitações")).toBe(
      "Pauta disciplinar",
    );
    expect(verifiedDocumentTitle("boletim-escolar", "Declaração de matrícula")).toBe(
      "Boletim escolar",
    );
  });

  it("o título que corresponde ao modelo fica, com o detalhe", () => {
    expect(verifiedDocumentTitle("pauta-disciplinar", "Pauta de Matemática — 10.ª A")).toBe(
      "Pauta de Matemática — 10.ª A",
    );
    expect(verifiedDocumentTitle("talao-matricula", "Declaração de matrícula")).toBe(
      "Declaração de matrícula",
    );
  });

  it("o documento de serviço leva sempre o nome do modelo à frente", () => {
    expect(verifiedDocumentTitle("service-document", "Recibo RC 2026/14")).toBe(
      "Documento de serviço — Recibo RC 2026/14",
    );
    expect(verifiedDocumentTitle("service-document", "Certificado de habilitações")).toBe(
      "Documento de serviço — Certificado de habilitações",
    );
    expect(verifiedDocumentTitle("service-document", "documento de serviço")).toBe(
      "Documento de serviço",
    );
  });
});
