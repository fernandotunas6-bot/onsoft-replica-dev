import { describe, expect, it } from "vitest";
import { runAcademicConsistencyCheck } from "@/features/academic/consistency-check";

describe("SIGA AcademicConsistencyCheck — Validações de Pré-Encerramento de Pauta", () => {
  it("detects unassigned teachers for subjects", () => {
    const report = runAcademicConsistencyCheck({
      classGroupId: "cg1",
      classGroupName: "7.ª Classe A",
      enrollments: [{ id: "e1", student_name: "Ana Manuel" }],
      subjects: [{ id: "lp", name: "Língua Portuguesa" }],
      classSubjects: [{ subject_id: "lp", teacher_id: null }],
      termGrades: [{ enrollment_id: "e1", subject_id: "lp", term: 1, mac: 14, npt: 12 }],
      term: 1,
    });

    expect(report.summary.unassignedSubjectsCount).toBe(1);
    expect(report.issues.some((i) => i.code === "UNASSIGNED_TEACHER")).toBe(true);
  });

  it("detects pending grades before locking term", () => {
    const report = runAcademicConsistencyCheck({
      classGroupId: "cg1",
      classGroupName: "7.ª Classe A",
      enrollments: [{ id: "e1", student_name: "Ana Manuel" }],
      subjects: [{ id: "lp", name: "Língua Portuguesa" }],
      classSubjects: [{ subject_id: "lp", teacher_id: "t1" }],
      termGrades: [], // Nenhuma nota lançada
      term: 1,
    });

    expect(report.summary.pendingGradesCount).toBe(1);
    expect(report.isReadyToLock).toBe(false);
    expect(report.issues.some((i) => i.code === "PENDING_GRADE")).toBe(true);
  });

  it("approves consistency check when all grades are entered and teachers assigned", () => {
    const report = runAcademicConsistencyCheck({
      classGroupId: "cg1",
      classGroupName: "7.ª Classe A",
      enrollments: [{ id: "e1", student_name: "Ana Manuel" }],
      subjects: [{ id: "lp", name: "Língua Portuguesa" }],
      classSubjects: [{ subject_id: "lp", teacher_id: "t1" }],
      termGrades: [{ enrollment_id: "e1", subject_id: "lp", term: 1, mac: 14, npt: 12 }],
      term: 1,
    });

    expect(report.summary.pendingGradesCount).toBe(0);
    expect(report.summary.unassignedSubjectsCount).toBe(0);
    expect(report.isReadyToLock).toBe(true);
  });
});
