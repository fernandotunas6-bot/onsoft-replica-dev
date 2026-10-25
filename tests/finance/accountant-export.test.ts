import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  buildAccountantSheets,
  luandaMonthRange,
  writeAccountantWorkbook,
} from "@/features/finance/accountant-export";
import { recentMonths } from "@/features/finance/components/AccountantExportDialog";

/**
 * Exportação mensal para o contabilista (decidido a 25/10/2026): a contabilidade oficial
 * faz-se fora do SIGA; o SIGA entrega cada documento do mês num Excel.
 */
const input = {
  schoolName: "Colégio Teste",
  month: "2026-10",
  invoices: [
    {
      invoice_number: "FT 2026/1",
      issued_at: "2026-10-02T09:00:00Z",
      student: "Ana",
      student_number: "1260001",
      item: "Propina",
      competence_month: "2026-10-01",
      amount: 10000,
      discount: 1000,
      penalty: 500,
      status: "partially_paid",
    },
    {
      invoice_number: "FT 2026/2",
      issued_at: "2026-10-03T09:00:00Z",
      student: "Rui",
      student_number: "1260002",
      item: "Propina",
      competence_month: "2026-10-01",
      amount: 10000,
      discount: 0,
      penalty: 0,
      status: "cancelled",
    },
  ],
  receipts: [
    {
      receipt_number: "REC-1",
      paid_on: "2026-10-05",
      student: "Ana",
      invoice_number: "FT 2026/1",
      method: "Numerário",
      amount: 4000,
      status: "issued",
      external_id: null,
    },
    {
      receipt_number: "REC-2",
      paid_on: "2026-10-06",
      student: "Ana",
      invoice_number: "FT 2026/1",
      method: "Cartão (TPA / Multicaixa)",
      amount: 1000,
      status: "reversed",
      external_id: "appypay:9",
    },
  ],
  reversals: [
    { receipt_number: "REC-2", reversed_at: "2026-10-07T10:00:00Z", amount: 1000, reason: "Erro" },
  ],
  expenses: [
    {
      document_number: "D-1",
      occurred_at: "2026-10-04",
      category: "Material",
      description: "Papel",
      method: "Numerário",
      amount: 2500,
      status: "posted",
    },
    {
      document_number: "D-2",
      occurred_at: "2026-10-09",
      category: "Equipamento",
      description: "Gerador",
      method: "Transferência",
      amount: 75000,
      status: "pending_approval",
    },
  ],
};

describe("exportação para o contabilista", () => {
  it("o resumo diz o que os documentos são e soma o que conta", () => {
    const [resumo] = buildAccountantSheets(input);
    const linha = (rubrica: string) => resumo!.rows.find((row) => row[0] === rubrica)?.[1];
    expect(String(linha("Natureza"))).toMatch(/Não são documentos fiscais certificados pela AGT/);
    expect(linha("Faturado (líquido de descontos, com multas)")).toBe(9500); // a anulada não conta
    expect(linha("Recebido (recibos do mês, incluindo os depois estornados)")).toBe(5000);
    expect(linha("Estornado no mês")).toBe(1000);
    expect(linha("Recebido líquido de estornos")).toBe(4000);
    expect(linha("Despesas lançadas")).toBe(2500); // a por aprovar não conta
    expect(linha("Recebido · Numerário")).toBe(4000);
    expect(linha("Despesa · Material")).toBe(2500);
    expect(linha("Despesa · Equipamento")).toBeUndefined();
  });

  it("um documento por linha, com estados em português", () => {
    const sheets = buildAccountantSheets(input);
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Resumo",
      "Faturas",
      "Recibos",
      "Estornos",
      "Despesas",
    ]);
    const faturas = sheets[1]!;
    expect(faturas.rows).toHaveLength(2);
    expect(faturas.rows[0]).toEqual([
      "FT 2026/1",
      "2026-10-02",
      "Ana",
      "1260001",
      "Propina",
      "2026-10",
      10000,
      1000,
      500,
      9500,
      "Parcial",
    ]);
    expect(faturas.rows[1]!.at(-1)).toBe("Anulada");
    expect(sheets[2]!.rows[1]).toContain("appypay:9");
    expect(sheets[4]!.rows[1]!.at(-1)).toBe("Por aprovar");
  });

  it("o Excel abre com as cinco folhas e os valores como números", async () => {
    const buffer = await writeAccountantWorkbook(buildAccountantSheets(input));
    const book = new ExcelJS.Workbook();
    // O tipo do load do exceljs é o Buffer antigo do Node; um ArrayBuffer serve a ambos.
    await book.xlsx.load(new Uint8Array(buffer).buffer);
    expect(book.worksheets.map((ws) => ws.name)).toEqual([
      "Resumo",
      "Faturas",
      "Recibos",
      "Estornos",
      "Despesas",
    ]);
    const faturas = book.getWorksheet("Faturas")!;
    expect(faturas.getRow(1).getCell(1).value).toBe("Nº");
    expect(faturas.getRow(2).getCell(10).value).toBe(9500);
    expect(faturas.getColumn(10).numFmt).toBe("#,##0.00");
  });

  it("o mês vai de dia 1 a dia 1 do seguinte, à hora de Luanda", () => {
    expect(luandaMonthRange("2026-10")).toEqual({
      firstDay: "2026-10-01",
      nextFirstDay: "2026-11-01",
      from: "2026-10-01T00:00:00+01:00",
      to: "2026-11-01T00:00:00+01:00",
    });
    expect(luandaMonthRange("2026-12").nextFirstDay).toBe("2027-01-01");
  });

  it("os meses à escolha são os últimos doze, o actual primeiro", () => {
    const months = recentMonths("2026-01-15");
    expect(months).toHaveLength(12);
    expect(months[0]!.value).toBe("2026-01");
    expect(months[1]!.value).toBe("2025-12");
    expect(months[11]!.value).toBe("2025-02");
    expect(months[0]!.label).toMatch(/^Janeiro de 2026$/);
  });

  it("o servidor filtra a escola em cada leitura e só deixa Administrador e Tesouraria", () => {
    const fonte = readFileSync(join(process.cwd(), "src/features/finance/server.ts"), "utf8");
    const fn = fonte.slice(fonte.indexOf("export const exportAccountantMonth"));
    expect(fn).toMatch(
      /requireSgaWriterFor\("financeiro", context\.supabase, context\.userId, \[\s*"Administrador",\s*"Tesouraria",\s*\]\)/,
    );
    const leituras = fn.match(/\.from\("(?!schools)[a-z_]+"\)/g)?.length ?? 0;
    expect(leituras).toBeGreaterThan(5);
    expect(fn.match(/\.eq\("school_id", schoolId\)/g)?.length).toBe(leituras);
    expect(fn).toMatch(/Este mês tem documentos a mais para um só ficheiro/);
  });
});
