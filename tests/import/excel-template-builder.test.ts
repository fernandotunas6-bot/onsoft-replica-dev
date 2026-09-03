import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildOfficialExcelTemplate } from "@/features/import/engine/excel-template-builder";

describe("SIGA Data Import Engine — Official Excel Template Builder", () => {
  it("deve gerar um arquivo XLSX válido para o módulo de alunos com 6 abas padronizadas", async () => {
    const buffer = await buildOfficialExcelTemplate("alunos");
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    // Verificar as 6 abas oficiais
    const sheetNames = workbook.worksheets.map((s) => s.name);
    expect(sheetNames).toContain("LEIA-ME");
    expect(sheetNames).toContain("DADOS");
    expect(sheetNames).toContain("EXEMPLOS");
    expect(sheetNames).toContain("LISTAS");
    expect(sheetNames).toContain("REFERENCIAS");
    expect(sheetNames).toContain("METADADOS");

    // Verificar a aba DADOS
    const sheetData = workbook.getWorksheet("DADOS");
    expect(sheetData).toBeDefined();
    const headerRow = sheetData!.getRow(1);
    expect(headerRow.cellCount).toBeGreaterThan(5);

    // Primeira coluna deve ser o Nome Completo (*)
    const firstHeader = String(headerRow.getCell(1).value || "");
    expect(firstHeader).toContain("Nome Completo");
    expect(firstHeader).toContain("*");

    // Verificar a aba METADADOS
    const sheetMeta = workbook.getWorksheet("METADADOS");
    expect(sheetMeta).toBeDefined();
    expect(sheetMeta!.getCell(2, 2).value).toBe("SIGA");
    expect(sheetMeta!.getCell(3, 2).value).toBe("SIGA-EXCHANGE-TEMPLATE");
    expect(sheetMeta!.getCell(5, 2).value).toBe("alunos");
  });

  it("deve gerar templates com validação de dados para campos de seleção", async () => {
    const buffer = await buildOfficialExcelTemplate("professores");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    // Verificar aba LISTAS com opções mapeadas
    const sheetLists = workbook.getWorksheet("LISTAS");
    expect(sheetLists).toBeDefined();
    expect(sheetLists!.rowCount).toBeGreaterThan(1);

    // Verificar que a aba DADOS possui validações por intervalo configuradas
    const sheetData = workbook.getWorksheet("DADOS");
    expect(sheetData).toBeDefined();
    const validations = (sheetData as any).dataValidations?.model || {};
    expect(Object.keys(validations).length).toBeGreaterThanOrEqual(1);
  });
});
