import { describe, expect, it } from "vitest";
import {
  checkUnitEnrollment,
  earnedCredits,
  gradeUnit,
  hasPrerequisiteCycle,
  studentProgress,
  unitSituations,
  type CurriculumUnit,
  type UnitEnrollment,
} from "@/features/academic/course-units";
import { DEFAULT_HIGHER_ED_REGULATION as REG } from "@/features/academic/higher-ed-regulation";

const units: CurriculumUnit[] = [
  { programSubjectId: "an1", subjectName: "Análise I", semester: 1, credits: 6, prerequisites: [] },
  { programSubjectId: "alg", subjectName: "Álgebra", semester: 1, credits: 6, prerequisites: [] },
  {
    programSubjectId: "an2",
    subjectName: "Análise II",
    semester: 2,
    credits: 6,
    prerequisites: ["an1"],
  },
  {
    programSubjectId: "an3",
    subjectName: "Análise III",
    semester: 3,
    credits: 6,
    prerequisites: ["an2"],
  },
];

const enrollment = (partial: Partial<UnitEnrollment> & { programSubjectId: string }) =>
  ({
    id: `e-${partial.programSubjectId}-${partial.academicYearId ?? "y1"}`,
    academicYearId: "y1",
    status: "inscrito",
    finalGrade: null,
    credits: 6,
    creditsEarned: 0,
    attempt: 1,
    ...partial,
  }) as UnitEnrollment;

describe("inscrição por unidade curricular", () => {
  it("primeiro ano, nada feito: cadeiras sem precedências disponíveis, as outras bloqueadas", () => {
    const s = unitSituations(REG, {
      units,
      enrollments: [],
      academicYearId: "y1",
      firstSemesterOfYear: 1,
    });
    expect(s.get("an1")).toEqual({ kind: "disponivel", attempt: 1, lateUnit: false });
    expect(s.get("an2")).toEqual({ kind: "bloqueada", missing: ["an1"] });
  });

  it("aprovada a precedência, a seguinte abre; reprovada, volta como cadeira em atraso", () => {
    const enrollments = [
      enrollment({ programSubjectId: "an1", status: "aprovado", finalGrade: 12, creditsEarned: 6 }),
      enrollment({ programSubjectId: "alg", status: "reprovado", finalGrade: 7 }),
    ];
    const s = unitSituations(REG, {
      units,
      enrollments,
      academicYearId: "y2",
      firstSemesterOfYear: 3,
    });
    expect(s.get("an1")).toEqual({ kind: "aprovada", grade: 12 });
    expect(s.get("an2")).toMatchObject({ kind: "disponivel", lateUnit: true });
    expect(s.get("alg")).toEqual({ kind: "disponivel", attempt: 2, lateUnit: true });
    expect(s.get("an3")).toEqual({ kind: "bloqueada", missing: ["an2"] });
  });

  it("com precedências só indicativas nada fica bloqueado", () => {
    const s = unitSituations(
      { ...REG, enforcePrerequisites: false },
      { units, enrollments: [], academicYearId: "y1", firstSemesterOfYear: 1 },
    );
    expect(s.get("an3")?.kind).toBe("disponivel");
  });

  it("recusa aprovadas, repetidas no ano, bloqueadas e acima do limite de créditos", () => {
    const enrollments = [
      enrollment({ programSubjectId: "an1", status: "aprovado", creditsEarned: 6 }),
      enrollment({ programSubjectId: "alg", academicYearId: "y2" }),
    ];
    const s = unitSituations(REG, {
      units,
      enrollments,
      academicYearId: "y2",
      firstSemesterOfYear: 3,
    });
    expect(checkUnitEnrollment(REG, s, units, ["an1"], 0)).toEqual({
      ok: false,
      reason: "Análise I já está aprovada.",
    });
    expect(checkUnitEnrollment(REG, s, units, ["alg"], 0).ok).toBe(false);
    expect(checkUnitEnrollment(REG, s, units, ["an3"], 0)).toEqual({
      ok: false,
      reason: "Análise III exige aprovação em: Análise II.",
    });
    expect(checkUnitEnrollment(REG, s, units, ["an2"], 70)).toEqual({
      ok: false,
      reason: "Passa o limite de 75 créditos por ano com Análise II.",
    });
    expect(checkUnitEnrollment(REG, s, units, ["an2"], 60)).toEqual({ ok: true });
  });

  it("anulada não conta como tentativa nem como inscrição do ano", () => {
    const s = unitSituations(REG, {
      units,
      enrollments: [enrollment({ programSubjectId: "an1", status: "anulado" })],
      academicYearId: "y1",
      firstSemesterOfYear: 1,
    });
    expect(s.get("an1")).toEqual({ kind: "disponivel", attempt: 1, lateUnit: false });
  });

  it("lançar notas segue o regulamento e só dá créditos a quem aprova", () => {
    expect(gradeUnit(REG, 6, { continuous: 15 })).toEqual({
      status: "dispensado",
      final_grade: 15,
      season: "frequencia",
      credits_earned: 6,
    });
    expect(gradeUnit(REG, 6, { continuous: 11 })).toMatchObject({
      status: "inscrito",
      credits_earned: 0,
    });
    expect(gradeUnit(REG, 6, { continuous: 10, normalExam: 5 })).toMatchObject({
      status: "reprovado",
      credits_earned: 0,
    });
  });

  it("créditos: conta cada cadeira uma vez e diz se transita", () => {
    const enrollments = [
      enrollment({ programSubjectId: "an1", status: "aprovado", creditsEarned: 6 }),
      enrollment({
        programSubjectId: "an1",
        academicYearId: "y0",
        status: "aprovado",
        creditsEarned: 6,
      }),
      enrollment({ programSubjectId: "alg", status: "dispensado", creditsEarned: 6 }),
    ];
    expect(earnedCredits(enrollments)).toBe(12);
    const progress = studentProgress(REG, units, enrollments, "y1");
    expect(progress.planCredits).toBe(24);
    expect(progress.progression).toEqual({ required: 45, earned: 12, advances: false });
  });

  it("detecta ciclos nas precedências", () => {
    const ok = new Map([
      ["an3", ["an2"]],
      ["an2", ["an1"]],
      ["an1", []],
    ]);
    expect(hasPrerequisiteCycle(ok)).toBe(false);
    ok.set("an1", ["an3"]);
    expect(hasPrerequisiteCycle(ok)).toBe(true);
  });

  it("limite de inscrições na mesma cadeira", () => {
    const reg = { ...REG, maxAttemptsPerUnit: 2 };
    const enrollments = [
      enrollment({ programSubjectId: "alg", academicYearId: "y0", status: "reprovado" }),
      enrollment({
        programSubjectId: "alg",
        academicYearId: "y1",
        status: "reprovado",
        attempt: 2,
      }),
    ];
    const s = unitSituations(reg, {
      units,
      enrollments,
      academicYearId: "y2",
      firstSemesterOfYear: 3,
    });
    expect(checkUnitEnrollment(reg, s, units, ["alg"], 0)).toEqual({
      ok: false,
      reason: "Álgebra: atingido o limite de 2 inscrições.",
    });
  });

  it("média ponderada pela melhor nota de cada cadeira, GPA e menção", () => {
    const enrollments = [
      enrollment({ programSubjectId: "an1", status: "aprovado", finalGrade: 12, creditsEarned: 6 }),
      enrollment({
        programSubjectId: "an1",
        academicYearId: "y2",
        status: "aprovado",
        finalGrade: 16,
        creditsEarned: 6,
      }),
      enrollment({
        programSubjectId: "alg",
        status: "dispensado",
        finalGrade: 14,
        creditsEarned: 6,
      }),
      enrollment({ programSubjectId: "an2", status: "reprovado", finalGrade: 6 }),
    ];
    const progress = studentProgress(REG, units, enrollments, "y2");
    expect(progress.average).toBe(15);
    expect(progress.gpa).toBe(2.5);
    expect(progress.mention).toBe("Bom");
  });
});
