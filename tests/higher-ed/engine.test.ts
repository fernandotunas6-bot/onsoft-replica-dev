import { describe, expect, it } from "vitest";
import {
  academicSemesterOf,
  checkEnrollmentBatch,
  checkUnitEnrollment,
  findPrerequisiteCycles,
  frequencyOutcome,
  planTotals,
  seasonEligibility,
  seasonResult,
  studentProgress,
  validatePlan,
  type PlanUnit,
  type Prerequisite,
  type UnitRecord,
} from "@/features/higher-ed/engine";
import { HIGHER_ED_DEFAULTS, parseSettingsDomain } from "@/features/school/settings-domains";

const reg = HIGHER_ED_DEFAULTS;
const unit = (id: string, semester: number, credits = 6): PlanUnit => ({
  id,
  subjectId: `s-${id}`,
  name: id.toUpperCase(),
  semester,
  credits,
});
// Licenciatura de 2 anos (4 semestres) para os testes.
const plan: PlanUnit[] = [
  unit("mat1", 1),
  unit("fis1", 1),
  unit("prog1", 1),
  unit("mat2", 2),
  unit("prog2", 2),
  unit("bd", 3),
  unit("redes", 3),
  unit("tfc", 4, 12),
];
const prereqs: Prerequisite[] = [
  { unitId: "mat2", requiresUnitId: "mat1" },
  { unitId: "prog2", requiresUnitId: "prog1" },
  { unitId: "bd", requiresUnitId: "prog2" },
  { unitId: "tfc", requiresUnitId: "bd" },
];
const rec = (
  unitId: string,
  status: UnitRecord["status"],
  extra: Partial<UnitRecord> = {},
): UnitRecord => ({
  unitId,
  academicYearId: "y1",
  attempt: 1,
  status,
  season: "normal",
  finalGrade: status === "aprovado" ? 12 : null,
  credits: plan.find((u) => u.id === unitId)?.credits ?? 6,
  creditsEarned: status === "aprovado" ? (plan.find((u) => u.id === unitId)?.credits ?? 6) : 0,
  ...extra,
});

describe("plano curricular", () => {
  it("plano válido não tem erros e soma créditos por semestre", () => {
    expect(validatePlan(plan, prereqs).filter((i) => i.level === "error")).toEqual([]);
    expect(planTotals(plan)).toEqual({
      totalCredits: 54,
      semesters: [
        { semester: 1, credits: 18 },
        { semester: 2, credits: 12 },
        { semester: 3, credits: 12 },
        { semester: 4, credits: 12 },
      ],
      years: 2,
    });
  });

  it("detecta precedências em círculo", () => {
    const cyclic = [...prereqs, { unitId: "prog1", requiresUnitId: "bd" }];
    const cycles = findPrerequisiteCycles(plan, cyclic);
    expect(cycles).toHaveLength(1);
    expect(validatePlan(plan, cyclic).some((i) => i.code === "prerequisite_cycle")).toBe(true);
  });

  it("avisa precedência que não é de semestre anterior e recusa auto-precedência", () => {
    const issues = validatePlan(plan, [
      { unitId: "mat1", requiresUnitId: "fis1" },
      { unitId: "redes", requiresUnitId: "redes" },
    ]);
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["prerequisite_not_earlier", "self_prerequisite"]),
    );
  });

  it("recusa cadeira repetida, créditos 0 e precedência para cadeira inexistente", () => {
    const issues = validatePlan(
      [...plan, { ...unit("mat1b", 3, 0), subjectId: "s-mat1" }],
      [{ unitId: "bd", requiresUnitId: "fantasma" }],
    );
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["duplicate_subject", "invalid_credits", "unknown_prerequisite"]),
    );
  });
});

describe("inscrição em cadeiras", () => {
  it("sem a precedência concluída não se inscreve", () => {
    const check = checkUnitEnrollment({
      unit: plan[3]!,
      plan,
      prerequisites: prereqs,
      records: [rec("mat1", "reprovado")],
      regulation: reg,
      academicYearId: "y2",
    });
    expect(check.ok).toBe(false);
    expect(check.reasons[0]).toContain("Precedências por concluir: MAT1");
  });

  it("dispensada (creditação) conta como precedência concluída", () => {
    const check = checkUnitEnrollment({
      unit: plan[3]!,
      plan,
      prerequisites: prereqs,
      records: [rec("mat1", "dispensado")],
      regulation: reg,
      academicYearId: "y2",
    });
    expect(check.ok).toBe(true);
  });

  it("cadeira já concluída ou já inscrita no ano é recusada", () => {
    const base = { plan, prerequisites: prereqs, regulation: reg, academicYearId: "y1" };
    expect(
      checkUnitEnrollment({ ...base, unit: plan[0]!, records: [rec("mat1", "aprovado")] }).ok,
    ).toBe(false);
    expect(
      checkUnitEnrollment({ ...base, unit: plan[0]!, records: [rec("mat1", "inscrito")] }).ok,
    ).toBe(false);
  });

  it("limite de tentativas conta reprovações e exclusões", () => {
    const records = [
      rec("mat1", "reprovado", { attempt: 1 }),
      rec("mat1", "excluido_frequencia", { attempt: 2, academicYearId: "y2" }),
    ];
    const check = checkUnitEnrollment({
      unit: plan[0]!,
      plan,
      prerequisites: prereqs,
      records,
      regulation: { ...reg, max_attempts: 2 },
      academicYearId: "y3",
    });
    expect(check.reasons.some((r) => r.includes("Esgotou as 2 tentativas"))).toBe(true);
  });

  it("limite de créditos por semestre e por ano, contando o que já está inscrito", () => {
    const batch = checkEnrollmentBatch({
      selected: [plan[0]!, plan[1]!, plan[2]!],
      plan,
      prerequisites: prereqs,
      records: [],
      regulation: { ...reg, max_credits_per_semester: 12 },
      academicYearId: "y1",
    });
    expect(batch.ok).toBe(false);
    expect(batch.creditsBySemester[1]).toBe(18);
    expect(batch.limits[0]).toContain("1.º semestre");
  });

  it("semestre lectivo a partir do curricular", () => {
    expect([1, 2, 3, 4].map(academicSemesterOf)).toEqual([1, 2, 1, 2]);
  });
});

describe("frequência e épocas", () => {
  it("excluído por faltas, por frequência, dispensado ou admitido", () => {
    expect(frequencyOutcome(15, 30, reg)).toEqual({ kind: "excluido_faltas" });
    expect(frequencyOutcome(5, 0, reg)).toEqual({ kind: "excluido_frequencia", frequency: 5 });
    expect(frequencyOutcome(15, 0, reg)).toEqual({ kind: "dispensado_exame", grade: 15 });
    expect(frequencyOutcome(9, 0, reg)).toEqual({ kind: "admitido", frequency: 9 });
    expect(frequencyOutcome(null, 0, reg)).toEqual({ kind: "sem_nota" });
  });

  it("dispensa desligada (0): quem tem 18 também vai a exame", () => {
    expect(frequencyOutcome(18, 0, { ...reg, exam_exemption_min: 0 }).kind).toBe("admitido");
  });

  it("época normal pondera frequência e exame pelo peso do regulamento", () => {
    expect(seasonResult({ season: "normal", frequency: 12, exam: 8, regulation: reg })).toEqual({
      status: "reprovado",
      finalGrade: 9.6,
    });
    expect(seasonResult({ season: "normal", frequency: 12, exam: 10, regulation: reg })).toEqual({
      status: "aprovado",
      finalGrade: 10.8,
    });
  });

  it("recurso e especial: conta só o exame; melhoria nunca baixa", () => {
    expect(
      seasonResult({ season: "recurso", frequency: 3, exam: 11, regulation: reg }).finalGrade,
    ).toBe(11);
    expect(
      seasonResult({
        season: "melhoria",
        frequency: null,
        exam: 9,
        previousGrade: 13,
        regulation: reg,
      }),
    ).toEqual({ status: "aprovado", finalGrade: 13 });
    expect(
      seasonResult({
        season: "melhoria",
        frequency: null,
        exam: 16,
        previousGrade: 13,
        regulation: reg,
      }).finalGrade,
    ).toBe(16);
  });

  it("recurso só para quem reprovou na normal; excluídos não vão", () => {
    const base = { plan, regulation: reg };
    expect(
      seasonEligibility({ ...base, unitId: "mat1", records: [rec("mat1", "reprovado")] }).recurso,
    ).toBe(true);
    expect(
      seasonEligibility({ ...base, unitId: "mat1", records: [rec("mat1", "excluido_frequencia")] })
        .recurso,
    ).toBe(false);
  });

  it("época especial só para finalistas (até N cadeiras em falta)", () => {
    const allButTwo = plan
      .filter((u) => u.id !== "redes" && u.id !== "tfc")
      .map((u) => rec(u.id, "aprovado"));
    const records = [...allButTwo, rec("redes", "reprovado")];
    expect(seasonEligibility({ unitId: "redes", records, plan, regulation: reg }).especial).toBe(
      true,
    );
    expect(
      seasonEligibility({
        unitId: "redes",
        records,
        plan,
        regulation: { ...reg, special_season_max_units: 1 },
      }).especial,
    ).toBe(false);
  });

  it("melhoria: só depois de aprovar, uma vez, e se a instituição a permitir", () => {
    const approved = [rec("mat1", "aprovado")];
    expect(
      seasonEligibility({ unitId: "mat1", records: approved, plan, regulation: reg }).melhoria,
    ).toBe(true);
    expect(
      seasonEligibility({
        unitId: "mat1",
        records: [...approved, rec("mat1", "aprovado", { season: "melhoria", attempt: 2 })],
        plan,
        regulation: reg,
      }).melhoria,
    ).toBe(false);
    expect(
      seasonEligibility({
        unitId: "mat1",
        records: approved,
        plan,
        regulation: { ...reg, improvement_enabled: false },
      }).melhoria,
    ).toBe(false);
  });
});

describe("épocas: alinhamento com o servidor", () => {
  it("normal só depois de lançada a frequência", () => {
    const base = { plan, regulation: reg, unitId: "mat1" };
    expect(
      seasonEligibility({ ...base, records: [rec("mat1", "inscrito", { season: null })] }).normal,
    ).toBe(false);
    expect(
      seasonEligibility({
        ...base,
        records: [rec("mat1", "inscrito", { season: "frequencia", finalGrade: 9 })],
      }).normal,
    ).toBe(true);
  });

  it("especial não serve para cadeira em curso nem para excluído por faltas", () => {
    const allButOne = plan.filter((u) => u.id !== "tfc").map((u) => rec(u.id, "aprovado"));
    const base = { plan, regulation: reg, unitId: "tfc" };
    expect(
      seasonEligibility({ ...base, records: [...allButOne, rec("tfc", "inscrito")] }).especial,
    ).toBe(false);
    expect(
      seasonEligibility({ ...base, records: [...allButOne, rec("tfc", "excluido_faltas")] })
        .especial,
    ).toBe(false);
    expect(
      seasonEligibility({ ...base, records: [...allButOne, rec("tfc", "excluido_frequencia")] })
        .especial,
    ).toBe(true);
  });
});

describe("progressão do estudante", () => {
  it("créditos, média ponderada (melhor nota), ano curricular, finalista e conclusão", () => {
    const records = [
      rec("mat1", "reprovado", { finalGrade: 8 }),
      rec("mat1", "aprovado", { attempt: 2, finalGrade: 14 }),
      rec("fis1", "aprovado", { finalGrade: 10 }),
      rec("prog1", "dispensado", { finalGrade: null }),
      rec("mat2", "aprovado", { finalGrade: 16 }),
      rec("prog2", "aprovado", { finalGrade: 12 }),
      rec("bd", "aprovado", { finalGrade: 11 }),
    ];
    const progress = studentProgress({ plan, records, regulation: reg });
    expect(progress.creditsEarned).toBe(36);
    expect(progress.creditsTotal).toBe(54);
    // (14+10+16+12+11)*6 / 30 — a dispensada não entra na média.
    expect(progress.average).toBe(12.6);
    expect(progress.pendingUnits.map((u) => u.id)).toEqual(["redes", "tfc"]);
    expect(progress.finalist).toBe(true);
    expect(progress.completed).toBe(false);
    expect(progress.curricularYear).toBe(1);
  });

  it("tudo concluído: curso completo", () => {
    const records = plan.map((u) => rec(u.id, "aprovado", { finalGrade: 15 }));
    const progress = studentProgress({ plan, records, regulation: reg });
    expect(progress).toMatchObject({ completed: true, percent: 100, average: 15, finalist: false });
  });
});

describe("regulamento do Ensino Superior", () => {
  it("valores por omissão sem nada gravado", () => {
    expect(parseSettingsDomain("higher_ed", undefined)).toEqual(HIGHER_ED_DEFAULTS);
  });

  it("dispensa abaixo da admissão sobe para a admissão; semestre não excede o ano", () => {
    const parsed = parseSettingsDomain("higher_ed", {
      exam_admission_min: 10,
      exam_exemption_min: 8,
      max_credits_per_year: 40,
      max_credits_per_semester: 50,
    });
    expect(parsed.exam_exemption_min).toBe(10);
    expect(parsed.max_credits_per_semester).toBe(40);
  });
});
