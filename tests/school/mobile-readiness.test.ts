import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = { middleware: () => chain, handler: (fn: unknown) => fn };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: vi.fn(),
  requireSgaWriterFor: vi.fn(),
}));

import {
  READINESS_ITEM_LIMIT,
  buildMobileReadiness,
  countEmails,
  emailState,
  type MobileReadinessSnapshot,
} from "@/features/school/mobile-readiness";
import { loadMobileReadinessSnapshot } from "@/features/school/mobile-readiness-server";

const person = (id: string, extra: Partial<MobileReadinessSnapshot["students"][number]> = {}) => ({
  id,
  name: `Pessoa ${id}`,
  hasAccount: false,
  hasRole: false,
  recordActive: true,
  email: "ok" as const,
  invitePending: false,
  classGroupIds: ["g1"],
  ...extra,
});
const group = (
  id: string,
  extra: Partial<MobileReadinessSnapshot["classGroups"][number]> = {},
) => ({
  id,
  name: `Turma ${id}`,
  students: 1,
  subjects: 2,
  subjectsWithoutTeacher: 0,
  subjectsWithoutTimetable: 0,
  ...extra,
});
const check = (r: ReturnType<typeof buildMobileReadiness>, id: string) =>
  r.checks.find((c) => c.id === id)!;

describe("prontidão do Mobile — regras", () => {
  const snapshot: MobileReadinessSnapshot = {
    activeYears: ["2026/2027"],
    students: [
      person("pronto", { hasAccount: true, hasRole: true }),
      person("sem-disciplinas", { hasAccount: true, hasRole: true, classGroupIds: ["g2"] }),
      person("sem-papel", { hasAccount: true }),
      person("sem-email", { email: "missing" }),
      person("repetido", { email: "duplicate" }),
      person("convidar"),
      person("convidado", { invitePending: true }),
      // Conta e papel, mas a ficha está inactiva: o Mobile recusa-o.
      person("inactivo", { hasAccount: true, hasRole: true, recordActive: false }),
    ],
    teachers: [
      { ...person("prof-pronto", { hasAccount: true, hasRole: true }), classSubjects: 2 },
      { ...person("prof-sem-turmas", { hasAccount: true, hasRole: true }), classSubjects: 0 },
      { ...person("prof-convidar"), classSubjects: 1 },
    ],
    classGroups: [
      group("g1", { subjectsWithoutTimetable: 1 }),
      group("g2", { subjects: 0, students: 3 }),
      group("g3", { subjectsWithoutTeacher: 2 }),
      group("vazia", { subjects: 0, students: 0 }),
    ],
  };
  const r = buildMobileReadiness(snapshot);

  it("conta como pronto só quem tem conta, papel e disciplinas", () => {
    expect(r.students).toEqual({ ready: 1, total: 8 });
    expect(check(r, "aluno-ficha-inactiva").items.map((i) => i.id)).toEqual(["inactivo"]);
    expect(check(r, "aluno-sem-papel").items.map((i) => i.id)).toEqual(["sem-papel"]);
    expect(r.teachers).toEqual({ ready: 1, total: 3 });
  });

  it("separa cada aluno pelo que lhe falta, com o atalho certo", () => {
    expect(check(r, "aluno-sem-email").items.map((i) => i.id)).toEqual(["sem-email"]);
    expect(check(r, "aluno-email-repetido").items.map((i) => i.id)).toEqual(["repetido"]);
    expect(check(r, "aluno-por-convidar").items.map((i) => i.id)).toEqual(["convidar"]);
    expect(check(r, "aluno-convite-pendente").items.map((i) => i.id)).toEqual(["convidado"]);
    expect(check(r, "aluno-sem-papel").items.map((i) => i.id)).toEqual(["sem-papel"]);
    expect(check(r, "aluno-sem-email").items[0]!.link).toEqual({
      to: "/alunos/$studentId",
      params: { studentId: "sem-email" },
    });
    expect(check(r, "aluno-por-convidar").action.to).toBe("/acessos");
  });

  it("aponta as turmas sem disciplinas, sem professor e sem horário", () => {
    // Uma turma vazia (sem alunos) não impede ninguém de usar o Mobile.
    expect(check(r, "turma-sem-disciplinas").items).toEqual([
      {
        id: "g2",
        label: "Turma g2",
        detail: "3 alunos matriculados",
        link: { to: "/pedagogica", search: { tab: "disciplinas", turma: "g2" } },
      },
    ]);
    expect(check(r, "turma-disciplina-sem-professor").items.map((i) => i.detail)).toEqual([
      "2 disciplinas sem professor",
    ]);
    expect(check(r, "turma-disciplina-sem-horario").items[0]!.link.search).toEqual({
      tab: "horarios",
      turma: "g1",
    });
    expect(check(r, "professor-sem-disciplinas").items.map((i) => i.id)).toEqual([
      "prof-sem-turmas",
    ]);
    expect(check(r, "professor-por-convidar").count).toBe(1);
  });

  it("envia no máximo um número fixo de linhas, por nome, com a contagem total", () => {
    const many = buildMobileReadiness({
      ...snapshot,
      students: Array.from({ length: READINESS_ITEM_LIMIT + 5 }, (_, i) =>
        person(`a${String(i).padStart(3, "0")}`, { name: `Z${100 - i}` }),
      ),
    });
    const c = check(many, "aluno-por-convidar");
    expect(c.count).toBe(READINESS_ITEM_LIMIT + 5);
    expect(c.items).toHaveLength(READINESS_ITEM_LIMIT);
    const names = c.items.map((i) => i.label);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt")));
  });

  it("um e-mail repetido só conta entre fichas sem conta, sem olhar a maiúsculas", () => {
    const counts = countEmails(["Ana@Escola.ao", "ana@escola.ao ", "rui@escola.ao", null, ""]);
    expect(emailState("ANA@escola.ao", false, counts)).toBe("duplicate");
    expect(emailState("ana@escola.ao", true, counts)).toBe("ok");
    expect(emailState("rui@escola.ao", false, counts)).toBe("ok");
    expect(emailState("  ", false, counts)).toBe("missing");
    expect(emailState(null, false, counts)).toBe("missing");
  });
});

type Row = Record<string, unknown>;
/** Base em memória: aplica eq/in/is/not e range, e regista cada consulta. */
function database(tables: Record<string, Row[]>) {
  const queries: {
    table: string;
    filters: [string, string, unknown][];
    range?: [number, number];
  }[] = [];
  const db = {
    from(table: string) {
      const q = {
        table,
        filters: [] as [string, string, unknown][],
        range: undefined as [number, number] | undefined,
      };
      queries.push(q);
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        eq: (f: string, v: unknown) => (q.filters.push(["eq", f, v]), chain),
        in: (f: string, v: unknown[]) => (q.filters.push(["in", f, v]), chain),
        is: (f: string, v: unknown) => (q.filters.push(["is", f, v]), chain),
        not: (f: string, _op: string, v: unknown) => (q.filters.push(["not", f, v]), chain),
        range: (a: number, b: number) => ((q.range = [a, b]), chain),
        then: (resolve: (v: unknown) => void) => {
          const rows = (tables[table] ?? []).filter((row) =>
            q.filters.every(([op, f, v]) =>
              op === "eq"
                ? row[f] === v
                : op === "in"
                  ? (v as unknown[]).includes(row[f])
                  : op === "is"
                    ? (row[f] ?? null) === v
                    : (row[f] ?? null) !== v,
            ),
          );
          const [a, b] = q.range ?? [0, rows.length];
          resolve({ data: rows.slice(a, b + 1), error: null });
        },
      };
      return chain;
    },
  };
  return { db: db as never, queries };
}

describe("prontidão do Mobile — leitura da base", () => {
  const S = "school";
  const base = () => ({
    academic_years: [
      { id: "y1", school_id: S, name: "2026/2027", status: "active" },
      { id: "y0", school_id: S, name: "2025/2026", status: "closed" },
    ],
    class_groups: [
      { id: "g1", school_id: S, name: "10.ª A", status: "active", academic_year_id: "y1" },
      { id: "g-old", school_id: S, name: "9.ª A", status: "active", academic_year_id: "y0" },
      { id: "g-draft", school_id: S, name: "Rascunho", status: "draft", academic_year_id: "y1" },
    ],
    enrollments: [
      {
        id: "e1",
        school_id: S,
        student_id: "s1",
        class_group_id: "g1",
        academic_year_id: "y1",
        status: "active",
      },
      {
        id: "e2",
        school_id: S,
        student_id: "s2",
        class_group_id: "g1",
        academic_year_id: "y1",
        status: "pending",
      },
      {
        id: "e3",
        school_id: S,
        student_id: "s3",
        class_group_id: "g-draft",
        academic_year_id: "y1",
        status: "active",
      },
    ],
    class_subjects: [
      { id: "cs1", school_id: S, class_group_id: "g1", teacher_id: "t1", status: "active" },
      { id: "cs2", school_id: S, class_group_id: "g1", teacher_id: null, status: "active" },
      { id: "cs3", school_id: S, class_group_id: "g1", teacher_id: "t1", status: "active" },
    ],
    academic_schedules: [
      { id: "pub", school_id: S, class_group_id: "g1", status: "published", deleted_at: null },
      { id: "draft", school_id: S, class_group_id: "g1", status: "draft", deleted_at: null },
    ],
    timetable_slots: [
      { id: "ts1", school_id: S, class_subject_id: "cs1", schedule_id: "pub", status: "active" },
      { id: "ts2", school_id: S, class_subject_id: "cs2", schedule_id: null, status: "active" },
      { id: "ts3", school_id: S, class_subject_id: "cs3", schedule_id: "draft", status: "active" },
    ],
    teachers: [{ id: "t1", school_id: S, person_id: "pt1", user_id: "ut1", status: "active" }],
    students: [{ id: "s1", school_id: S, person_id: "ps1", deleted_at: null, status: "active" }],
    people: [
      {
        id: "ps1",
        school_id: S,
        full_name: "Ana",
        email: "Ana@x.ao",
        user_id: null,
        deleted_at: null,
        status: "active",
      },
      {
        id: "px",
        school_id: S,
        full_name: "Outra",
        email: "ana@x.ao",
        user_id: null,
        deleted_at: null,
        status: "active",
      },
      {
        id: "pt1",
        school_id: S,
        full_name: "Prof",
        email: "p@x.ao",
        user_id: "ut1",
        deleted_at: null,
        status: "active",
      },
      {
        id: "foreign",
        school_id: "other",
        full_name: "X",
        email: "ana@x.ao",
        user_id: null,
        deleted_at: null,
        status: "active",
      },
    ],
    school_invitations: [] as Row[],
    school_memberships: [{ id: "m1", school_id: S, user_id: "ut1", status: "active" }],
    member_roles: [{ school_id: S, membership_id: "m1", roles: { code: "teacher" } }],
  });

  it("segue as regras do Mobile e só lê a escola dada", async () => {
    const { db, queries } = database(base());
    const snap = await loadMobileReadinessSnapshot(db, S);
    expect(snap.activeYears).toEqual(["2026/2027"]);
    // Só a matrícula activa da turma activa do ano activo.
    expect(snap.students.map((s) => s.id)).toEqual(["s1"]);
    expect(snap.students[0]).toMatchObject({
      name: "Ana",
      hasAccount: false,
      email: "duplicate",
      classGroupIds: ["g1"],
    });
    expect(snap.teachers[0]).toMatchObject({ hasAccount: true, hasRole: true, classSubjects: 2 });
    // cs3 só tem horário em rascunho; cs2 tem horário antigo, sem versão.
    expect(snap.classGroups).toEqual([
      {
        id: "g1",
        name: "10.ª A",
        students: 1,
        subjects: 3,
        subjectsWithoutTeacher: 1,
        subjectsWithoutTimetable: 1,
      },
    ]);
    expect(
      queries.every((q) =>
        q.filters.some(([op, f, v]) => op === "eq" && f === "school_id" && v === S),
      ),
    ).toBe(true);
  });

  it("um professor sem o papel Professor na escola não conta como pronto", async () => {
    const tables = base();
    tables.member_roles = [{ school_id: S, membership_id: "m1", roles: { code: "secretary" } }];
    const { db } = database(tables);
    expect((await loadMobileReadinessSnapshot(db, S)).teachers[0]!.hasRole).toBe(false);
  });

  it("como o Mobile, só reconhece fichas e pessoas activas", async () => {
    const tables = base();
    expect((await loadMobileReadinessSnapshot(database(tables).db, S)).students[0]).toMatchObject({
      recordActive: true,
    });
    tables.students[0]!.status = "inactive";
    expect((await loadMobileReadinessSnapshot(database(tables).db, S)).students[0]).toMatchObject({
      recordActive: false,
    });
    tables.students[0]!.status = "active";
    tables.people[2]!.status = "archived";
    expect((await loadMobileReadinessSnapshot(database(tables).db, S)).teachers[0]).toMatchObject({
      recordActive: false,
    });
  });

  it("um convite expirado não conta como pendente", async () => {
    const tables = base();
    tables.people[1]!.email = "outra@x.ao";
    tables.school_invitations = [
      { school_id: S, email: "ANA@x.ao", status: "pending", expires_at: "2000-01-01T00:00:00Z" },
    ];
    let snap = await loadMobileReadinessSnapshot(database(tables).db, S);
    expect(snap.students[0]).toMatchObject({ email: "ok", invitePending: false });
    tables.school_invitations[0]!.expires_at = "2999-01-01T00:00:00Z";
    snap = await loadMobileReadinessSnapshot(database(tables).db, S);
    expect(snap.students[0]!.invitePending).toBe(true);
  });

  it("lê tudo, mesmo acima das 1000 linhas por resposta", async () => {
    const tables = base();
    tables.enrollments = Array.from({ length: 2300 }, (_, i) => ({
      id: `e${i}`,
      school_id: S,
      student_id: `s${i}`,
      class_group_id: "g1",
      academic_year_id: "y1",
      status: "active",
    }));
    tables.students = tables.enrollments.map((e, i) => ({
      id: String(e.student_id),
      school_id: S,
      person_id: `p${i}`,
      deleted_at: null,
      status: "active",
    }));
    const snap = await loadMobileReadinessSnapshot(database(tables).db, S);
    expect(snap.students).toHaveLength(2300);
    expect(snap.classGroups[0]!.students).toBe(2300);
  });

  it("uma leitura falhada não passa por «tudo pronto»", async () => {
    const { db } = database(base());
    const failing = {
      from: (table: string) =>
        table === "class_subjects"
          ? {
              select: () => failing.from(table),
              eq: () => failing.from(table),
              in: () => failing.from(table),
              order: () => failing.from(table),
              range: () => Promise.resolve({ data: null, error: { message: "x" } }),
            }
          : (db as { from: (t: string) => unknown }).from(table),
    };
    await expect(loadMobileReadinessSnapshot(failing as never, S)).rejects.toThrow(
      /prontidão do Mobile/,
    );
  });
});
