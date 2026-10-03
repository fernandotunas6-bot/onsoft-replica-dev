import { describe, expect, it } from "vitest";
import {
  buildSetupSteps,
  summarizeSetup,
  type SchoolSetupSnapshot,
} from "@/features/school/setup-steps";

const empty: SchoolSetupSnapshot = {
  school: {
    name: "Escola Nova",
    nif: null,
    phone: null,
    email: null,
    address: null,
    hasLogo: false,
  },
  activeYearName: null,
  teachingLevels: [],
  pendingStructureGrades: 0,
  termsInActiveYear: 0,
  gradeLevels: 0,
  classGroupsInActiveYear: 0,
  classSubjects: 0,
  classSubjectsWithTeacher: 0,
  activeTeachers: 0,
  hasActiveAssessmentRule: false,
  pricedFeeItems: 0,
  hasBankIban: false,
  otherActiveMembers: 0,
  adminHasTwoFactor: false,
  enrollmentFormOpen: true,
  students: 0,
};

const complete: SchoolSetupSnapshot = {
  school: {
    name: "Escola Nova",
    nif: "5000000000",
    phone: "923000000",
    email: "geral@escola.ao",
    address: "Luanda",
    hasLogo: true,
  },
  activeYearName: "2026/2027",
  teachingLevels: ["primario", "i_ciclo"],
  pendingStructureGrades: 0,
  termsInActiveYear: 3,
  gradeLevels: 6,
  classGroupsInActiveYear: 12,
  classSubjects: 80,
  classSubjectsWithTeacher: 80,
  activeTeachers: 20,
  hasActiveAssessmentRule: true,
  pricedFeeItems: 2,
  hasBankIban: true,
  otherActiveMembers: 5,
  adminHasTwoFactor: true,
  enrollmentFormOpen: true,
  students: 300,
};

describe("assistente de configuração da escola", () => {
  it("níveis escolhidos mas classes em falta: o passo cria-as no próprio assistente", () => {
    const step = buildSetupSteps({ ...complete, pendingStructureGrades: 4 }).find(
      (s) => s.id === "classes",
    );
    expect(step?.done).toBe(false);
    expect(step?.action).toEqual({ type: "apply-structure" });
    expect(step?.detail).toBe("Faltam 4 classes dos níveis escolhidos.");
  });

  it("sem níveis escolhidos: primeiro escolher os níveis", () => {
    const steps = buildSetupSteps({ ...complete, teachingLevels: [] });
    expect(steps.find((s) => s.id === "niveis")?.done).toBe(false);
    expect(steps.find((s) => s.id === "classes")?.action).toEqual({
      type: "route",
      to: "/pedagogica",
      search: { tab: "estrutura" },
    });
  });

  it("escola acabada de criar: começa pelos dados da escola e não está pronta", () => {
    const summary = summarizeSetup(buildSetupSteps(empty));
    expect(summary.ready).toBe(false);
    expect(summary.nextStep?.id).toBe("dados-escola");
    expect(summary.percent).toBeLessThan(20);
  });

  it("propinas a 0 Kz (como o provisionamento as cria) não contam como definidas", () => {
    const steps = buildSetupSteps({ ...complete, pricedFeeItems: 0 });
    expect(steps.find((s) => s.id === "propinas")?.done).toBe(false);
    expect(summarizeSetup(steps).ready).toBe(false);
  });

  it("menos de três períodos fica pendente", () => {
    const step = buildSetupSteps({ ...complete, termsInActiveYear: 2 }).find(
      (s) => s.id === "periodos",
    );
    expect(step?.done).toBe(false);
    expect(step?.detail).toContain("normalmente são 3");
  });

  it("disciplinas sem professor não completam o passo dos professores", () => {
    const step = buildSetupSteps({ ...complete, classSubjectsWithTeacher: 70 }).find(
      (s) => s.id === "professores",
    );
    expect(step?.done).toBe(false);
    expect(step?.detail).toBe("70 de 80 disciplinas com professor.");
  });

  it("tudo feito: 100% e pronta", () => {
    const summary = summarizeSetup(buildSetupSteps(complete));
    expect(summary).toMatchObject({ ready: true, percent: 100, nextStep: undefined });
  });

  it("os passos opcionais não impedem a escola de estar pronta", () => {
    const summary = summarizeSetup(
      buildSetupSteps({
        ...complete,
        school: { ...complete.school, hasLogo: false },
        hasBankIban: false,
        otherActiveMembers: 0,
        students: 0,
      }),
    );
    expect(summary.ready).toBe(true);
    expect(summary.percent).toBeLessThan(100);
  });
});

describe("passos do ensino superior", () => {
  it("só aparecem quando a escola tem ensino superior", () => {
    const ids = buildSetupSteps(complete).map((step) => step.id);
    expect(ids).not.toContain("superior-regulamento");
    expect(ids).not.toContain("superior-planos");
  });

  it("pedem regulamento e plano para cada curso", () => {
    const steps = buildSetupSteps({
      ...complete,
      teachingLevels: ["superior"],
      higherEd: { regulationConfigured: false, programs: 2, programsWithPlan: 1 },
    });
    const byId = new Map(steps.map((step) => [step.id, step]));
    expect(byId.get("superior-regulamento")?.done).toBe(false);
    expect(byId.get("superior-planos")?.done).toBe(false);
    expect(byId.get("superior-planos")?.detail).toContain("1 de 2");

    const done = buildSetupSteps({
      ...complete,
      teachingLevels: ["superior"],
      higherEd: { regulationConfigured: true, programs: 2, programsWithPlan: 2 },
    });
    const doneById = new Map(done.map((step) => [step.id, step]));
    expect(doneById.get("superior-regulamento")?.done).toBe(true);
    expect(doneById.get("superior-planos")?.done).toBe(true);
  });

  it("sem cursos o passo do plano fica pendente", () => {
    const steps = buildSetupSteps({
      ...complete,
      teachingLevels: ["superior"],
      higherEd: { regulationConfigured: true, programs: 0, programsWithPlan: 0 },
    });
    expect(steps.find((step) => step.id === "superior-planos")?.done).toBe(false);
  });
});
