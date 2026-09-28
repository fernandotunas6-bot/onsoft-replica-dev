import { describe, expect, it } from "vitest";
import {
  buildInstitutionPlan,
  institutionProfileSchema,
} from "@/features/saas/institution-profile";
import { applyInstitutionPlan } from "@/features/saas/institution-bootstrap";
import { publicSchoolSignupInputSchema } from "@/features/saas/schemas";

const plan = (levels: string[], extra: Record<string, unknown> = {}) =>
  buildInstitutionPlan(
    institutionProfileSchema.parse({ levels, shifts: ["morning"], rooms: 0, ...extra }),
    2026,
  );

describe("perfil da instituição → estrutura inicial", () => {
  it("escola primária: 1ª–6ª classe, disciplinas do primário, três trimestres", () => {
    const p = plan(["primario"]);
    expect(p.academicLevels.map((l) => l.code)).toEqual(["PRIM"]);
    expect(p.gradeLevels.map((g) => g.name)).toEqual([
      "1ª Classe",
      "2ª Classe",
      "3ª Classe",
      "4ª Classe",
      "5ª Classe",
      "6ª Classe",
    ]);
    expect(p.subjects.map((s) => s.code)).toContain("EM");
    expect(p.subjects.map((s) => s.code)).not.toContain("FIS");
    expect(p.terms.map((t) => t.name)).toEqual(["1º Trimestre", "2º Trimestre", "3º Trimestre"]);
    expect(p.evaluationPeriods).toBe(3);
    expect(p.isComplex).toBe(false);
  });

  it("complexo escolar: vários níveis, disciplinas sem repetir, na ordem do sistema", () => {
    const p = plan(["ii_ciclo", "primario", "i_ciclo"]);
    expect(p.academicLevels.map((l) => l.code)).toEqual(["PRIM", "SEC1", "SEC2"]);
    expect(p.isComplex).toBe(true);
    const codes = p.subjects.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(p.gradeLevels).toHaveLength(6 + 3 + 3);
    expect(p.teachingLevels).toEqual(["primario", "i_ciclo", "ii_ciclo"]);
  });

  it("só ensino superior: dois semestres, sem classes nem disciplinas inventadas", () => {
    const p = plan(["superior"]);
    expect(p.terms.map((t) => t.name)).toEqual(["1º Semestre", "2º Semestre"]);
    expect(p.evaluationPeriods).toBe(2);
    expect(p.programs).toEqual([]);
    expect(p.gradeLevels).toEqual([]);
    expect(p.subjects).toEqual([]);
    expect(p.hasHigherEducation).toBe(true);
  });

  it("superior com ensino geral mantém os trimestres do MED", () => {
    expect(plan(["i_ciclo", "superior"]).evaluationPeriods).toBe(3);
  });

  it("técnico-profissional: 10ª–13ª, curso técnico activo nas definições", () => {
    const p = plan(["tecnico"]);
    expect(p.gradeLevels.map((g) => g.sequence)).toEqual([10, 11, 12, 13]);
    expect(p.courses).toEqual(["tecnico"]);
    expect(p.programs[0]?.kind).toBe("technical");
  });

  it("turnos e salas pedidos", () => {
    const p = plan(["primario"], { shifts: ["evening", "morning"], rooms: 3 });
    expect(p.shifts.map((s) => s.code)).toEqual(["MANHA", "NOITE"]);
    expect(p.rooms.map((r) => r.code)).toEqual(["S01", "S02", "S03"]);
  });

  it("o registo público aceita o perfil e recusa escolhas vazias", () => {
    const base = {
      name: "Colégio Esperança",
      nif: "5417123456",
      contact_name: "Maria Canguele",
      contact_email: "maria@example.ao",
      plan_code: "professional",
      slug: "colegio-esperanca",
      admin_email: "maria@example.ao",
      admin_name: "Maria Canguele",
      admin_password: "Esperanca2026x",
    };
    expect(
      publicSchoolSignupInputSchema.safeParse({
        ...base,
        institution: { levels: ["primario"], shifts: ["morning"], rooms: 12 },
      }).success,
    ).toBe(true);
    expect(
      publicSchoolSignupInputSchema.safeParse({
        ...base,
        institution: { levels: [], shifts: ["morning"], rooms: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("gravação do plano", () => {
  function fakeDb() {
    const writes: Array<{ table: string; op: string; rows: unknown }> = [];
    const ids: Record<string, Array<{ id: string; code: string }>> = {
      academic_levels: [{ id: "lvl-prim", code: "PRIM" }],
      programs: [{ id: "prog-prim", code: "PRIM" }],
    };
    const db = {
      from(table: string) {
        const chain = {
          upsert(rows: unknown) {
            writes.push({ table, op: "upsert", rows });
            return Promise.resolve({ error: null });
          },
          insert(rows: unknown) {
            writes.push({ table, op: "insert", rows });
            return Promise.resolve({ error: null });
          },
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle() {
            return Promise.resolve({
              data: table === "academic_years" ? { id: "year-1" } : null,
              error: null,
            });
          },
          then(resolve: (v: unknown) => void) {
            resolve({ data: ids[table] ?? [], error: null });
          },
        };
        return chain;
      },
    };
    return { db, writes };
  }

  it("grava níveis, classes ligadas ao programa, disciplinas, períodos, turnos, salas e definições", async () => {
    const { db, writes } = fakeDb();
    const result = await applyInstitutionPlan(
      db as never,
      { schoolId: "s1", adminUserId: "u1", plan: plan(["primario"], { rooms: 2 }) },
      () => {},
    );
    const tables = writes.map((w) => w.table);
    expect(tables).toEqual(
      expect.arrayContaining([
        "academic_levels",
        "programs",
        "grade_levels",
        "subjects",
        "terms",
        "school_shifts",
        "rooms",
        "school_settings",
      ]),
    );
    const grades = writes.find((w) => w.table === "grade_levels")!.rows as Array<{
      program_id: string;
    }>;
    expect(grades.every((g) => g.program_id === "prog-prim")).toBe(true);
    const settings = writes.find((w) => w.table === "school_settings")!.rows as {
      value: { teachingLevels: string[] };
    };
    expect(settings.value.teachingLevels).toEqual(["primario"]);
    expect(result.seeded).toEqual(expect.arrayContaining(["classes", "trimestres", "salas"]));
  });
});
