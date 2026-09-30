import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/documents/print-issue-loader", () => ({ issuePrintDocument: vi.fn() }));
vi.mock("@/lib/export-pdf-loader", () => ({ exportOfficialPautaPdf: vi.fn() }));
vi.mock("@/lib/export-csv", () => ({ exportCsv: vi.fn() }));

import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { exportOfficialPautaPdf } from "@/lib/export-pdf-loader";
import { exportCsv } from "@/lib/export-csv";
import {
  exportAssessmentDocument,
  pautaColumns,
  toPautaExportRows,
  type AssessmentDocumentContext,
} from "@/features/academic/assessment-documents";

const rows = toPautaExportRows([
  {
    student: { student_name: "Ana Silva", registration_number: "P-001" },
    mac: 14,
    npp: 12.4,
    npt: 15,
    average: 14.25,
    situacao: { label: "Transita" },
  },
  {
    student: { student_name: "Bruno Costa", registration_number: null },
    mac: null,
    npp: null,
    npt: null,
    average: null,
    situacao: { label: "Pendente" },
  },
]);

function context(overrides: Partial<AssessmentDocumentContext> = {}): AssessmentDocumentContext {
  return {
    contextKind: "turma",
    group: { name: "10A", grade_name: "10ª" },
    subjectName: "Matemática",
    school: { name: "Escola Teste", directorName: "Directora", academicYear: "2026" },
    meta: { schoolName: "Escola Teste", academicYear: "2026", validationCode: "V-1" },
    rows,
    classMap: [
      {
        id: "g1",
        name: "10A",
        gradeName: "10ª",
        courseName: "Ciências",
        alunos: 2,
        lancamentos: 1,
        media: 14.25,
        transitam: 1,
        pendentes: 1,
      },
    ],
    dossier: [
      {
        subjectId: "s1",
        subjectName: "Matemática",
        terms: [14, null, null],
        mfa: 14,
        situacao: { label: "Transita", tone: "success" },
      },
    ] as AssessmentDocumentContext["dossier"],
    student: null,
    validationCode: "V-1",
    ...overrides,
  };
}

function lastPrint() {
  const calls = vi.mocked(issuePrintDocument).mock.calls;
  return calls[calls.length - 1]![0];
}

describe("documentos do Centro de Avaliação", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a pauta oficial tem notas inteiras, média com uma casa e processo vazio quando falta", () => {
    expect(rows[0]).toMatchObject({ n: "01", proc: "P-001", mac: "14", npp: "12", media: "14.3" });
    expect(rows[1]).toMatchObject({ n: "02", proc: "", situacao: "Pendente" });
  });

  it("pauta da turma em PDF: emite o documento e cai no PDF oficial com o título certo", async () => {
    exportAssessmentDocument(context(), "pdf");
    const input = lastPrint();
    expect(input.tipo).toBe("Pauta geral da turma");
    await input.fallback?.();
    expect(exportOfficialPautaPdf).toHaveBeenCalledWith(
      "pauta-10A",
      "Pauta da turma",
      expect.objectContaining({ validationCode: "V-1" }),
      pautaColumns,
      rows,
    );
  });

  it("pauta da disciplina em Excel vai para CSV com as colunas da pauta", () => {
    exportAssessmentDocument(context({ contextKind: "disciplina" }), "excel");
    expect(exportCsv).toHaveBeenCalledWith("pauta-10A", pautaColumns, rows);
    expect(issuePrintDocument).not.toHaveBeenCalled();
  });

  it("sem turma o nome do ficheiro usa 'turma'", () => {
    exportAssessmentDocument(context({ group: null }), "excel", "relacao");
    expect(vi.mocked(exportCsv).mock.calls[0]![0]).toBe("relacao-turma");
    expect(vi.mocked(exportCsv).mock.calls[0]![2]).toEqual([
      { n: "01", aluno: "Ana Silva", proc: "P-001" },
      { n: "02", aluno: "Bruno Costa", proc: "" },
    ]);
  });

  it("boletim sem aluno seleccionado gera a pauta", () => {
    exportAssessmentDocument(context(), "pdf", "boletim");
    expect(lastPrint().tipo).toBe("Pauta geral da turma");
  });

  it("boletim do aluno leva o número de processo e o código de validação", async () => {
    exportAssessmentDocument(
      context({
        student: {
          student: { student_name: "Ana Silva", registration_number: "P-001" },
          situacao: { label: "Transita" },
          average: 14.25,
        },
      }),
      "pdf",
      "boletim",
    );
    const input = lastPrint();
    expect(input.tipo).toBe("Boletim escolar");
    expect(input.student).toMatchObject({
      fullName: "Ana Silva",
      academicNumber: "P-001",
      className: "10A",
      validationCode: "V-1",
    });
    await input.fallback?.();
    expect(vi.mocked(exportOfficialPautaPdf).mock.calls[0]![2].subjectName).toBeUndefined();
  });

  it("mapa em Excel resume cada turma", () => {
    exportAssessmentDocument(context(), "excel", "mapa");
    expect(vi.mocked(exportCsv).mock.calls[0]![0]).toBe("mapa-10A");
    expect(vi.mocked(exportCsv).mock.calls[0]![2]).toEqual([
      {
        classe: "10ª",
        curso: "Ciências",
        turma: "10A",
        alunos: 2,
        media: "14.3",
        transitam: 1,
        pendentes: 1,
      },
    ]);
  });

  it("acta e validação são sempre PDF, mesmo pedidas como Excel", () => {
    exportAssessmentDocument(context(), "excel", "acta");
    expect(lastPrint().tipo).toBe("Acta do conselho de notas");
    exportAssessmentDocument(context(), "excel", "validacao");
    expect(lastPrint().tipo).toBe("Relatório de validação");
    expect(exportCsv).not.toHaveBeenCalled();
  });
});
