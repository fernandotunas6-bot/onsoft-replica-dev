import { describe, expect, it } from "vitest";
import { buildOfficialPautaPdf, placeSignatureBlock } from "@/lib/export-pdf";

const columns = ["Nº", "Nome", "MAC", "NPP", "NPT", "MT", "Obs", "Situação"].map(
  (label, index) => ({
    label,
    value: (row: string[]) => row[index],
  }),
);
const meta = { schoolName: "Escola Teste", academicYear: "2026", className: "10A" };
const rowsFor = (n: number) =>
  Array.from({ length: n }, (_, i) => [
    String(i + 1),
    `Aluno ${i + 1}`,
    "12",
    "13",
    "14",
    "13,5",
    "—",
    "Transita",
  ]);

describe("pauta oficial em PDF", () => {
  it("nunca põe as assinaturas sobre a tabela (1 a 80 alunos)", async () => {
    for (let n = 1; n <= 80; n += 1) {
      const result = await buildOfficialPautaPdf("Pauta", meta, columns, rowsFor(n));
      if (result.signaturesPage === result.tableEndPage) {
        expect(result.signaturesY - result.tableEndY, `n=${n}`).toBeGreaterThanOrEqual(10);
      } else {
        expect(result.signaturesPage, `n=${n}`).toBe(result.tableEndPage + 1);
      }
      const pageHeight = result.doc.internal.pageSize.getHeight();
      expect(result.signaturesY, `n=${n}`).toBeLessThanOrEqual(pageHeight - 24);
    }
  });

  it("os casos que antes se sobrepunham (16, 39, 40) passam para página nova", () => {
    // Paisagem A4: 210 mm de altura. Fins de tabela medidos com o código antigo.
    expect(placeSignatureBlock(191.2, 210).newPage).toBe(true);
    expect(placeSignatureBlock(195.2, 210).newPage).toBe(true);
    expect(placeSignatureBlock(150, 210)).toEqual({ y: 172, newPage: false });
  });

  it("numera todas as páginas", async () => {
    const { doc } = await buildOfficialPautaPdf("Pauta", meta, columns, rowsFor(70));
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    const text = doc.output();
    expect(text).toContain(`Página ${pages} de ${pages}`);
    expect(text).toContain("Escola Teste · Pauta · Turma 10A · 2026");
  });
});
