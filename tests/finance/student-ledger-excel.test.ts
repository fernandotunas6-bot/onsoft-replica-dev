import { describe, expect, it } from "vitest";
import { buildStudentLedgerWorkbook, safeExcelText } from "@/features/finance/student-ledger-excel";

const student = {
  studentId: "student-1",
  number: "00234567",
  name: "=HYPERLINK(\"evil\")",
  levelName: "Secundário",
  programName: "Ciências",
  gradeName: "10.ª",
  className: "A",
  billed: 14500,
  paid: 4500,
  outstanding: 10000,
  overdue: 8000,
  invoiceCount: 2,
};
const opts = { schoolName: "Escola Exemplo", academicYear: "2026", checkedOn: "2026-10-30" };

describe("exportação financeira de estudantes", () => {
  it("protege texto potencialmente interpretado como fórmula", () => {
    expect(safeExcelText("=SUM(1,2)")).toBe("'=SUM(1,2)");
    expect(safeExcelText("  @IMPORT")).toBe("'  @IMPORT");
    expect(safeExcelText("00234567")).toBe("00234567");
  });

  it("preserva números de processo, pagos, dívidas e as três folhas", async () => {
    const book = await buildStudentLedgerWorkbook([student], opts);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Alunos", "Devedores", "Resumo"]);
    const row = book.getWorksheet("Alunos")!.getRow(2);
    expect(row.getCell(1).value).toBe("00234567");
    expect(row.getCell(2).value).toBe("'=HYPERLINK(\"evil\")");
    expect(row.getCell(8).value).toBe(4500);
    expect(row.getCell(9).value).toBe(10000);
    expect(book.getWorksheet("Devedores")!.rowCount).toBe(2);
    expect(book.getWorksheet("Resumo")!.getCell("B8").value).toBe(10000);
  });

  it("não classifica aluno sem factura como pago", async () => {
    const book = await buildStudentLedgerWorkbook(
      [{ ...student, billed: 0, paid: 0, outstanding: 0, overdue: 0, invoiceCount: 0 }],
      opts,
    );
    expect(book.getWorksheet("Alunos")!.getCell("L2").value).toBe("Sem facturas");
    expect(book.getWorksheet("Devedores")!.rowCount).toBe(1);
  });
});
