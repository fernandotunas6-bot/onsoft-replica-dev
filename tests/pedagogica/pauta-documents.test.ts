import { describe, expect, it } from "vitest";
import type { StudentAcademicSummary } from "@/features/academic/assessment-engine";
import {
  buildClassContext,
  buildFinalPautaStudents,
  buildMiniPautaStudents,
  buildTrimesterPautaStudents,
  filterPautaStudents,
  isPassingStatus,
  toGender,
  toStudentStatus,
} from "@/features/pedagogica/components/pautas/pauta-documents";

const summaries: StudentAcademicSummary[] = [
  {
    enrollmentId: "e1",
    studentName: "Ana Silva",
    registrationNumber: "2026-001",
    subjects: [
      { subjectId: "mat", subjectName: "Matemática", mt1: 14, mt2: 12, mt3: null, mfd: 13 },
      { subjectId: "por", subjectName: "Português", mt1: 8, mt2: null, mt3: null, mfd: 8 },
    ],
    overallMfd: 10.5,
    status: "TRANSITA",
    failingSubjectsCount: 1,
  },
  {
    enrollmentId: "e2",
    studentName: "Bruno Costa",
    subjects: [
      { subjectId: "mat", subjectName: "Matemática", mt1: null, mt2: null, mt3: null, mfd: null },
    ],
    overallMfd: null,
    status: "PENDENTE",
    failingSubjectsCount: 0,
  },
];
const genders = new Map([
  ["e1", toGender("female")],
  ["e2", toGender("male")],
]);

describe("conversões", () => {
  it("PENDENTE → estado vazio; sexo em português", () => {
    expect(toStudentStatus("PENDENTE")).toBe("");
    expect(toStudentStatus("RECURSO")).toBe("RECURSO");
    expect(toGender("female")).toBe("F");
    expect(toGender("male")).toBe("M");
    expect(toGender(null)).toBe("");
  });

  it("contexto da turma com valores por omissão", () => {
    const context = buildClassContext({
      academicYear: "2026/2027",
      cycle: "i_ciclo",
      pautaNumber: "P-01",
    });
    expect(context).toMatchObject({ className: "Classe", classGroup: "Turma", period: "Manhã" });
    expect(context).not.toHaveProperty("term");
  });
});

describe("buildMiniPautaStudents", () => {
  it("junta as notas gravadas da disciplina à MT de cada trimestre", () => {
    const [ana, bruno] = buildMiniPautaStudents({
      summaries,
      subjectId: "mat",
      termGrades: [
        { enrollment_id: "e1", subject_id: "mat", term: 1, mac: 13, npp: 14, npt: 15 },
        { enrollment_id: "e1", subject_id: "por", term: 1, mac: 1, npp: 1, npt: 1 },
      ],
      genderByEnrollmentId: genders,
    });
    expect(ana).toMatchObject({
      code: "2026-001",
      number: 1,
      gender: "F",
      t1: { mact: 13, npp: 14, npt: 15, mt: 14 },
      t2: { mact: null, mt: 12 },
      mfd: 13,
      status: "TRANSITA",
    });
    expect(bruno).toMatchObject({ code: "EST-2", gender: "M", mfd: null, status: "" });
  });
});

describe("buildTrimesterPautaStudents", () => {
  it("média do trimestre às décimas e estado pela regra do ciclo", () => {
    const [ana, bruno] = buildTrimesterPautaStudents({
      summaries,
      subjects: [{ id: "mat" }, { id: "por" }],
      term: 1,
      cycle: "i_ciclo",
      promotionOptions: { passing: 10 },
      genderByEnrollmentId: genders,
    });
    expect(ana!.subjectGrades).toEqual({ mat: 14, por: 8 });
    expect(ana!.average).toBe(11);
    expect(ana!.status).not.toBe("");
    expect(bruno!.average).toBeNull();
    expect(bruno!.status).toBe("");
  });
});

describe("buildFinalPautaStudents", () => {
  it("MT1–MT3 e MFD por disciplina", () => {
    const [ana] = buildFinalPautaStudents({ summaries, genderByEnrollmentId: genders });
    expect(ana!.subjects.map((s) => s.mfd)).toEqual([13, 8]);
    expect(ana!.status).toBe("TRANSITA");
  });
});

describe("filterPautaStudents", () => {
  const list = [
    { name: "Ana Silva", code: "2026-001", status: "TRANSITA" },
    { name: "Bruno Costa", code: "EST-2", status: "" },
    { name: "Carla Neto", code: "2026-003", status: "RECURSO" },
    { name: "Dário Lopes", code: "2026-004", status: "APTO (PAP)" },
  ];

  it("pesquisa por nome ou código", () => {
    expect(filterPautaStudents(list, " costa ", "all").map((s) => s.name)).toEqual(["Bruno Costa"]);
    expect(filterPautaStudents(list, "003", "all").map((s) => s.name)).toEqual(["Carla Neto"]);
  });

  it("Aprovados e Não transitam", () => {
    expect(filterPautaStudents(list, "", "pass").map((s) => s.name)).toEqual([
      "Ana Silva",
      "Dário Lopes",
    ]);
    expect(filterPautaStudents(list, "", "fail").map((s) => s.name)).toEqual(["Carla Neto"]);
    expect(isPassingStatus("")).toBe(false);
  });
});
