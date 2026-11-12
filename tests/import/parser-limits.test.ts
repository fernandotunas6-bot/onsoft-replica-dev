import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { MAX_ROWS_PER_SHEET, parseImportFile } from "@/features/import/engine/parse";

describe("limites e integridade do parser", () => {
  it("aceita exactamente o limite e recusa a linha extra em CSV", async () => {
    const rows = Array.from({ length: MAX_ROWS_PER_SHEET }, (_, i) => `AUDIT-${i}`);
    const parsed = await parseImportFile(Buffer.from("nome\n" + rows.join("\n")), "AUDIT.csv");
    expect(parsed.sheets[0]!.rows).toHaveLength(MAX_ROWS_PER_SHEET);
    expect(parsed.sheets[0]!.rows.at(-1)).toEqual({ nome: `AUDIT-${MAX_ROWS_PER_SHEET - 1}` });
    await expect(
      parseImportFile(Buffer.from("nome\n" + rows.join("\n") + "\nAUDIT-extra"), "AUDIT.csv"),
    ).rejects.toThrow(/excede o limite/);
  });
  it("recusa excesso em XLSX e não conta linhas vazias", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("AUDIT");
    sheet.addRow(["nome"]);
    for (let i = 0; i < MAX_ROWS_PER_SHEET; i++) sheet.addRow([`AUDIT-${i}`]);
    sheet.addRow([]);
    sheet.addRow(["AUDIT-extra"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseImportFile(buffer, "AUDIT.xlsx")).rejects.toThrow(/excede o limite/);
  }, 30000);
  it("recusa colunas desiguais e aspas inválidas em vez de aceitar análise incompleta", async () => {
    await expect(
      parseImportFile(Buffer.from("nome,email\nAna,ana@example.test,extra"), "AUDIT.csv"),
    ).rejects.toThrow(/CSV contém/);
    await expect(
      parseImportFile(Buffer.from('nome,email\n"Ana,ana@example.test'), "AUDIT.csv"),
    ).rejects.toThrow(/CSV contém/);
  });
  it("200 linhas com BOM, acentos, datas e campos vazios mantêm todas as linhas", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => `João AUDIT-${i},2026-01-01,`);
    const parsed = await parseImportFile(
      Buffer.from("\ufeffnome,data,telefone\n" + rows.join("\n")),
      "AUDIT.csv",
    );
    expect(parsed.sheets[0]!.rows).toHaveLength(200);
    expect(parsed.sheets[0]!.rows.at(-1)).toEqual({
      nome: "João AUDIT-199",
      data: "2026-01-01",
      telefone: "",
    });
  });
});
