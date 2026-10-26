import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: vi.fn(),
  requireSgaWriterFor: vi.fn(),
  requireSgaWriterForWrite: vi.fn(),
}));
vi.mock("@/features/students/enrollment-core", () => ({
  ENROLLMENT_2FA_MESSAGE: "2FA",
  placeStudentInClass: vi.fn(),
}));

const { buildRenewalPlan } = await import("@/features/academic/year-rollover-server");

type Row = Record<string, unknown>;

/** Base em memória: só `eq`, `in`, `order`, `maybeSingle` — o que o plano usa. */
function memoryDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[column]));
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: rows, error: null }),
      };
      return chain;
    },
  } as never;
}

const S = "school";
const base = (): Record<string, Row[]> => ({
  academic_years: [
    { id: "y25", school_id: S, name: "2025/2026", starts_on: "2025-09-01" },
    { id: "y26", school_id: S, name: "2026/2027", starts_on: "2026-09-01" },
  ],
  grade_levels: [
    { id: "g7", school_id: S, program_id: "geral", sequence: 7, name: "7.ª Classe" },
    { id: "g8", school_id: S, program_id: "geral", sequence: 8, name: "8.ª Classe" },
  ],
  class_groups: [
    {
      id: "7a",
      school_id: S,
      name: "A",
      academic_year_id: "y25",
      grade_level_id: "g7",
      status: "active",
    },
    {
      id: "8a",
      school_id: S,
      name: "A",
      academic_year_id: "y26",
      grade_level_id: "g8",
      status: "draft",
      capacity: 30,
    },
    {
      id: "7a-26",
      school_id: S,
      name: "A",
      academic_year_id: "y26",
      grade_level_id: "g7",
      status: "active",
    },
    // Arquivada: não recebe alunos.
    {
      id: "8z",
      school_id: S,
      name: "Z",
      academic_year_id: "y26",
      grade_level_id: "g8",
      status: "archived",
    },
  ],
  enrollments: [
    { id: "e1", school_id: S, student_id: "s1", class_group_id: "7a", status: "completed" },
    { id: "e2", school_id: S, student_id: "s2", class_group_id: "7a", status: "active" },
    { id: "e3", school_id: S, student_id: "s3", class_group_id: "7a", status: "active" },
    { id: "e4", school_id: S, student_id: "s4", class_group_id: "7a", status: "cancelled" },
  ],
  students: [
    { id: "s1", school_id: S, status: "active", person_id: "p1" },
    { id: "s2", school_id: S, status: "active", person_id: "p2" },
    { id: "s3", school_id: S, status: "active", person_id: "p3" },
  ],
  people: [
    { id: "p1", school_id: S, full_name: "Ana" },
    { id: "p2", school_id: S, full_name: "Bia" },
    { id: "p3", school_id: S, full_name: "Caio" },
  ],
  student_academic_history: [
    // Registo desta matrícula.
    {
      school_id: S,
      student_id: "s1",
      enrollment_id: "e1",
      academic_year_label: "2025/2026",
      outcome: "Transitou",
      updated_at: "2026-07-01",
    },
    // Registo antigo, sem matrícula: conta pelo nome do ano.
    {
      school_id: S,
      student_id: "s2",
      enrollment_id: null,
      academic_year_label: "2025/2026",
      outcome: "Não transitou",
      updated_at: "2026-07-01",
    },
    // De outro ano: não conta.
    {
      school_id: S,
      student_id: "s3",
      enrollment_id: null,
      academic_year_label: "2024/2025",
      outcome: "Transitou",
      updated_at: "2025-07-01",
    },
  ],
});

const input = { sourceClassGroupId: "7a", targetAcademicYearId: "y26" };

describe("plano de renovação lido da base", () => {
  it("usa o resultado da matrícula, o registo antigo do mesmo ano, e ignora outros anos", async () => {
    const plan = await buildRenewalPlan(memoryDb(base()), S, input);
    expect(plan.passClassGroupId).toBe("8a");
    expect(plan.repeatClassGroupId).toBe("7a-26");
    expect(plan.passOptions.map((o) => o.id)).toEqual(["8a"]);
    expect(plan.lines.map((l) => [l.name, l.action, l.targetClassGroupId])).toEqual([
      ["Ana", "enroll", "8a"],
      ["Bia", "enroll", "7a-26"],
      ["Caio", "skip", null],
    ]);
  });

  it("aluno já matriculado no novo ano não é duplicado", async () => {
    const tables = base();
    tables.enrollments!.push({
      id: "e9",
      school_id: S,
      student_id: "s1",
      class_group_id: "8a",
      academic_year_id: "y26",
      status: "active",
    });
    const plan = await buildRenewalPlan(memoryDb(tables), S, input);
    expect(plan.lines.find((l) => l.name === "Ana")?.action).toBe("already");
    expect(plan.passOptions[0]?.free).toBe(29);
  });

  it("recusa um ano de destino que não começa depois", async () => {
    await expect(
      buildRenewalPlan(memoryDb(base()), S, {
        sourceClassGroupId: "7a-26",
        targetAcademicYearId: "y25",
      }),
    ).rejects.toThrow("O ano de destino tem de começar depois do ano da turma de origem.");
  });

  it("recusa uma turma de destino que não é da classe seguinte", async () => {
    await expect(
      buildRenewalPlan(memoryDb(base()), S, { ...input, passClassGroupId: "7a-26" }),
    ).rejects.toThrow("A turma escolhida não serve para a classe seguinte.");
  });

  it("turma de outra escola não existe", async () => {
    await expect(buildRenewalPlan(memoryDb(base()), "outra", input)).rejects.toThrow(
      "Turma de origem não encontrada nesta escola.",
    );
  });
});
