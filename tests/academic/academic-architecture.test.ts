import { describe, expect, it } from "vitest";
import {
  ACADEMIC_MODULES,
  moduleSnapshot,
  type AcademicStructureCounts,
} from "@/features/academic/academic-architecture";

const empty: AcademicStructureCounts = {
  yearName: "2026/2027",
  yearActive: true,
  activeRuleSets: 0,
  subjects: 0,
  terms: 0,
  classGroups: 0,
  classSubjects: 0,
  classSubjectsWithTeacher: 0,
  enrollments: 0,
  assessments: 0,
  gradebooks: {},
  gradeSheets: {},
  pendingGradeChanges: 0,
  historyRecords: 0,
  auditEvents30d: 0,
};
const byId = (id: string) => ACADEMIC_MODULES.find((m) => m.id === id)!;

describe("arquitectura académica", () => {
  it("16 módulos numerados de 1 a 16, cada um com os seis campos", () => {
    expect(ACADEMIC_MODULES.map((m) => m.number)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
    for (const m of ACADEMIC_MODULES) {
      for (const field of [m.owners, m.entity, m.usedBy, m.validation, m.destination]) {
        expect(field.trim().length).toBeGreaterThan(3);
      }
      expect(m.createdIn.label.length).toBeGreaterThan(2);
    }
  });

  it("recuperação e exames reflectem as épocas e inscrições reais", () => {
    expect(moduleSnapshot(byId("recuperacao"), empty).status).toBe("partial");
    expect(moduleSnapshot(byId("exames"), { ...empty, subjects: 50 }).status).toBe("partial");
    const withExams = { ...empty, examSessions: 2, examRegistrations: 1 };
    expect(moduleSnapshot(byId("exames"), withExams)).toEqual({
      status: "ready",
      metric: "2 épocas",
    });
    expect(moduleSnapshot(byId("recuperacao"), withExams).metric).toBe("1 inscrição");
  });
  it("estado a partir das contagens reais", () => {
    expect(moduleSnapshot(byId("turmas"), empty)).toEqual({
      status: "missing",
      metric: "Sem turmas",
    });
    expect(moduleSnapshot(byId("turmas"), { ...empty, classGroups: 12 }).metric).toBe("12 turmas");
    expect(
      moduleSnapshot(byId("professores"), {
        ...empty,
        classSubjects: 10,
        classSubjectsWithTeacher: 7,
      }),
    ).toEqual({ status: "partial", metric: "3 sem professor" });
    expect(moduleSnapshot(byId("configuracao"), empty).metric).toBe(
      "Sem regra de avaliação activa",
    );
    expect(
      moduleSnapshot(byId("pautas"), { ...empty, gradeSheets: { draft: 2, published: 1 } }),
    ).toEqual({ status: "partial", metric: "3 pautas · 1 publicadas" });
    expect(moduleSnapshot(byId("medias"), empty).status).toBe("automatic");
  });
});
