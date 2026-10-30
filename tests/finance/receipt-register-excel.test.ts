import { describe, expect, it } from "vitest";
import { buildReceiptWorkbook } from "@/features/finance/receipt-register-excel";

const sample = {
  id: "r-01",
  receiptNumber: "REC-2026/001",
  invoiceNumber: "FT-2026/020",
  studentNumber: "00001234",
  studentName: "+SUM(A1)",
  paidOn: "2026-10-20",
  method: "bank_transfer",
  amount: 1850.75,
  status: "issued",
  reversalReason: "",
  externalId: "",
};
const context = { schoolName: "Escola Teste", exportedOn: "2026-10-30", filterDescription: "Outubro de 2026" };

describe("Excel de recibos", () => {
  it("preserva referências como texto e distingue emitidos e anulados", async () => {
    const book = await buildReceiptWorkbook(
      [sample, { ...sample, id: "r-02", status: "reversed", amount: 100.25 }],
      context,
    );
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Recibos", "Resumo"]);
    const sheet = book.getWorksheet("Recibos")!;
    expect(sheet.getCell("C2").value).toBe("00001234");
    expect(sheet.getCell("D2").value).toBe("'+SUM(A1)");
    expect(sheet.getCell("G2").value).toBe(1850.75);
    expect(sheet.getCell("H3").value).toBe("Anulado");
    expect(book.getWorksheet("Resumo")!.getCell("B7").value).toBe(1850.75);
    expect(book.getWorksheet("Resumo")!.getCell("B8").value).toBe(100.25);
  });
});
