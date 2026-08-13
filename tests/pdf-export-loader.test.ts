import { beforeEach, describe, expect, it, vi } from "vitest";

const exportPdfTable = vi.fn();
const exportOfficialPautaPdf = vi.fn();
const exportOfficialDeclarationPdf = vi.fn();

vi.mock("@/lib/export-pdf", () => ({
  exportPdfTable,
  exportOfficialPautaPdf,
  exportOfficialDeclarationPdf,
}));

import {
  exportOfficialDeclarationPdf as loadOfficialDeclarationPdf,
  exportOfficialPautaPdf as loadOfficialPautaPdf,
  exportPdfTable as loadPdfTable,
} from "@/lib/export-pdf-loader";

describe("pdf export loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and forwards table exports only when requested", async () => {
    const rows = [{ student: "Ana", score: 18 }];
    const columns = [
      { label: "Aluno", value: (row: (typeof rows)[number]) => row.student },
      { label: "Nota", value: (row: (typeof rows)[number]) => row.score },
    ];

    await loadPdfTable("notas", "Notas", columns, rows, "1.º trimestre");

    expect(exportPdfTable).toHaveBeenCalledWith("notas", "Notas", columns, rows, "1.º trimestre");
  });

  it("forwards official documents with their original metadata", async () => {
    const meta = { schoolName: "SIGA", academicYear: "2026" };
    const rows = [{ student: "Ana" }];
    const columns = [{ label: "Aluno", value: (row: (typeof rows)[number]) => row.student }];

    await loadOfficialPautaPdf("pauta", "Pauta", meta, columns, rows);
    await loadOfficialDeclarationPdf("declaracao", "Declaração", {
      ...meta,
      studentName: "Ana",
      registrationNumber: "2026-001",
      body: "Declaração de matrícula.",
    });

    expect(exportOfficialPautaPdf).toHaveBeenCalledWith("pauta", "Pauta", meta, columns, rows);
    expect(exportOfficialDeclarationPdf).toHaveBeenCalledWith("declaracao", "Declaração", {
      ...meta,
      studentName: "Ana",
      registrationNumber: "2026-001",
      body: "Declaração de matrícula.",
    });
  });
});
