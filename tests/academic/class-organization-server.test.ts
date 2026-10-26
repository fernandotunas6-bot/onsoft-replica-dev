import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let claims: Record<string, unknown> = { aal: "aal2" };
const placed: Array<{ studentId: string; classGroupId: string }> = [];
const S = "00000000-0000-0000-0000-00000000000a";
const LEVEL = "00000000-0000-0000-0000-0000000000c7";

// «tabela.coluna» lê a tabela embutida, como o filtro do PostgREST num embed.
const get = (row: Row, column: string): unknown =>
  column.split(".").reduce<unknown>((value, key) => (value as Row | undefined)?.[key], row);
const reads: string[] = [];

function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let max = Infinity;
      const rows = () =>
        (tables[table] ?? []).filter((row) => filters.every((f) => f(row))).slice(0, max);
      reads.push(table);
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: (n: number) => {
          max = n;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          filters.push((row) => get(row, column) === value);
          return chain;
        },
        neq: (column: string, value: unknown) => {
          filters.push((row) => get(row, column) !== value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(get(row, column)));
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
  };
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => memoryDb(),
  requireSgaWriterFor: async () => ({ schoolId: S, appRole: "Secretaria" }),
  requireSgaWriterForWrite: async () => ({ schoolId: S, appRole: "Secretaria" }),
}));
vi.mock("@/features/students/enrollment-core", () => ({
  ENROLLMENT_2FA_MESSAGE: "Matricular e mudar de turma exigem 2FA.",
  // A regra única de colocação: aqui só se regista a ordem e se aplica à base.
  placeStudentInClass: async (_db: unknown, _session: unknown, input: Row) => {
    placed.push({ studentId: String(input.studentId), classGroupId: String(input.classGroupId) });
    const enrollment = tables.enrollments!.find((row) => row.student_id === input.studentId)!;
    enrollment.class_group_id = input.classGroupId;
    return {};
  },
}));
vi.mock("@/features/audit/record-audit", () => ({ recordAccessAudit: async () => undefined }));
vi.mock("@/features/calendar/dates", () => ({ todayInLuanda: () => "2026-10-26" }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      validator: (parse: (input: unknown) => unknown) => {
        fn.parse = parse;
        return fn;
      },
      middleware: () => fn,
      handler:
        (h: (ctx: { data: unknown; context: Row }) => unknown) => (call?: { data: unknown }) =>
          h({ data: fn.parse(call?.data), context: { userId: "staff", claims, supabase: {} } }),
      parse: (input: unknown) => input,
    };
    return fn;
  },
}));

const server = await import("@/features/academic/class-organization-server");

const student = (n: number, birth: string, group: string) => ({ n, birth, group });
function seed(
  list: Array<{ n: number; birth: string; group: string }>,
  withRecords: number[] = [],
) {
  tables = {
    academic_years: [{ id: "y1", school_id: S, name: "2026/2027", status: "active" }],
    grade_levels: [{ id: LEVEL, school_id: S, name: "7.ª Classe", sequence: 7, program_id: "p1" }],
    programs: [{ id: "p1", school_id: S, name: "Ensino Geral" }],
    class_groups: [
      {
        id: "cA",
        school_id: S,
        academic_year_id: "y1",
        grade_level_id: LEVEL,
        shift: "morning",
        code: "7A-M",
        name: "7ª A — Manhã",
        capacity: 2,
        status: "active",
      },
      {
        id: "cB",
        school_id: S,
        academic_year_id: "y1",
        grade_level_id: LEVEL,
        shift: "morning",
        code: "7B-M",
        name: "7ª B — Manhã",
        capacity: 2,
        status: "active",
      },
      {
        id: "cT",
        school_id: S,
        academic_year_id: "y1",
        grade_level_id: LEVEL,
        shift: "afternoon",
        code: "7A-T",
        name: "7ª A — Tarde",
        capacity: 35,
        status: "active",
      },
    ],
    enrollments: list.map((s) => ({
      id: `e${s.n}`,
      school_id: S,
      academic_year_id: "y1",
      student_id: `s${s.n}`,
      class_group_id: s.group,
      status: "active",
    })),
    students: list.map((s) => ({
      id: `s${s.n}`,
      school_id: S,
      person_id: `p${s.n}`,
      student_number: `126000${s.n}`,
    })),
    people: list.map((s) => ({
      id: `p${s.n}`,
      school_id: S,
      full_name: `Aluno ${s.n}`,
      date_of_birth: s.birth,
    })),
    siga_assessment_scores: withRecords.map((n) => ({ school_id: S, enrollment_id: `e${n}` })),
  };
}

beforeEach(() => {
  claims = { aal: "aal2" };
  placed.length = 0;
  reads.length = 0;
});

const attendance = (n: number, classGroupId: string) => ({
  school_id: S,
  student_id: `s${n}`,
  siga_attendance_sessions: { class_group_id: classGroupId },
});

describe("organizar turmas no servidor", () => {
  it("lista as classes e turnos do ano com turmas e alunos", async () => {
    seed([student(1, "2013-01-01", "cA"), student(2, "2014-01-01", "cB")]);
    const { scopes, year } = await server.listOrganizationScopes({ data: {} });
    expect(year.name).toBe("2026/2027");
    expect(scopes).toEqual([
      expect.objectContaining({
        gradeLevelName: "7.ª Classe",
        shift: "afternoon",
        classes: 1,
        students: 0,
      }),
      expect.objectContaining({ shift: "morning", shiftLabel: "Manhã", classes: 2, students: 2 }),
    ]);
  });

  it("pré-visualiza só a classe e o turno escolhidos; com notas fica", async () => {
    seed(
      [
        student(1, "2012-01-01", "cA"), // mais velho, com notas na A
        student(2, "2014-06-01", "cB"),
        student(3, "2013-06-01", "cB"),
      ],
      [1],
    );
    const plan = await server.previewClassOrganization({
      data: { gradeLevelId: LEVEL, shift: "morning" },
    });
    expect(plan.classes.map((c) => c.letter)).toEqual(["A", "B"]);
    const status = Object.fromEntries(plan.lines.map((l) => [l.studentId, [l.status, l.toLetter]]));
    expect(status).toEqual({ s1: ["records", "A"], s2: ["move", "A"], s3: ["same", "B"] });
  });

  it("presença na chamada actual prende o aluno, mesmo com centenas de linhas", async () => {
    seed([
      student(1, "2012-01-01", "cA"), // mais velho, na A, com 1500 presenças
      student(2, "2012-02-01", "cA"), // mais velho, na A, com uma presença
      student(3, "2014-01-01", "cB"),
    ]);
    tables.siga_attendance_records = [
      ...Array.from({ length: 1500 }, () => attendance(1, "cA")),
      attendance(2, "cA"),
      // Presença noutra turma (outro turno) não conta para esta.
      attendance(3, "cT"),
    ];
    const plan = await server.previewClassOrganization({
      data: { gradeLevelId: LEVEL, shift: "morning" },
    });
    const status = Object.fromEntries(plan.lines.map((l) => [l.studentId, l.status]));
    expect(status).toMatchObject({ s1: "records", s2: "records" });
    expect(status.s3).not.toBe("records");
    // A primeira página encheu-se só com o aluno 1; a segunda já o tirou do filtro.
    expect(reads.filter((t) => t === "siga_attendance_records")).toHaveLength(2);
  });

  it("inscrição em exame também prende o aluno à turma", async () => {
    seed([student(1, "2012-01-01", "cA"), student(2, "2014-01-01", "cB")]);
    tables.siga_exam_registrations = [{ school_id: S, enrollment_id: "e1" }];
    const plan = await server.previewClassOrganization({
      data: { gradeLevelId: LEVEL, shift: "morning" },
    });
    expect(plan.lines.find((l) => l.studentId === "s1")?.status).toBe("records");
  });

  it("aplica pela regra única de colocação, na ordem que não passa a lotação", async () => {
    // A cheia com os mais velhos, B com os mais novos: tudo troca.
    seed([
      student(1, "2012-01-01", "cA"),
      student(2, "2012-02-01", "cA"),
      student(3, "2014-01-01", "cB"),
    ]);
    const plan = await server.previewClassOrganization({
      data: { gradeLevelId: LEVEL, shift: "morning" },
    });
    const result = await server.applyClassOrganization({
      data: { gradeLevelId: LEVEL, shift: "morning", signature: plan.signature },
    });
    expect(result).toEqual({ moved: 2, failed: [], blocked: [] });
    // A está cheia: primeiro sai s1 para a B, só depois entra s3 na A.
    expect(placed).toEqual([
      { studentId: "s1", classGroupId: "cB" },
      { studentId: "s3", classGroupId: "cA" },
    ]);
  });

  it("recusa sem 2FA, ou se as turmas mudaram desde a pré-visualização", async () => {
    seed([student(1, "2012-01-01", "cA"), student(2, "2014-01-01", "cB")]);
    const plan = await server.previewClassOrganization({
      data: { gradeLevelId: LEVEL, shift: "morning" },
    });
    claims = { aal: "aal1" };
    await expect(
      server.applyClassOrganization({
        data: { gradeLevelId: LEVEL, shift: "morning", signature: plan.signature },
      }),
    ).rejects.toThrow("2FA");

    claims = { aal: "aal2" };
    // Entretanto lançaram-se notas ao aluno 2: o plano já não é o mesmo.
    tables.siga_assessment_scores = [{ school_id: S, enrollment_id: "e2" }];
    await expect(
      server.applyClassOrganization({
        data: { gradeLevelId: LEVEL, shift: "morning", signature: plan.signature },
      }),
    ).rejects.toThrow("mudaram desde a pré-visualização");
    expect(placed).toEqual([]);
  });
});
