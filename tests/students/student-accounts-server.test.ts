import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let claims: Record<string, unknown> = { aal: "aal2" };
let users: Map<string, { id: string; email: string; app_metadata: Row; password?: string }>;
let failLinking = false;
const deleted: string[] = [];
const S = "00000000-0000-0000-0000-00000000000a";

function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Row | null = null;
      let inserted: Row | null = null;
      const run = () => {
        if (inserted) {
          const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, ...inserted };
          (tables[table] ??= []).push(row);
          return { data: [row], error: null };
        }
        let found = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        if (patch) {
          if (table === "people" && failLinking) found = [];
          for (const row of found) Object.assign(row, patch);
        }
        if (table === "member_roles") {
          found = found.map((row) => ({
            ...row,
            roles: (tables.roles ?? []).find((role) => role.id === row.role_id) ?? null,
          }));
        }
        return { data: found, error: null };
      };
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value);
          return chain;
        },
        insert: (row: Row) => {
          inserted = row;
          return chain;
        },
        upsert: (row: Row) => {
          inserted = row;
          return chain;
        },
        update: (row: Row) => {
          patch = row;
          return chain;
        },
        single: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
        maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve(run()),
      };
      return chain;
    },
    auth: {
      admin: {
        createUser: async (input: { email: string; password: string; app_metadata: Row }) => {
          if ([...users.values()].some((user) => user.email === input.email)) {
            return { data: { user: null }, error: { message: "User already registered" } };
          }
          const id = `user-${users.size + 1}`;
          users.set(id, { id, email: input.email, app_metadata: input.app_metadata, password: input.password });
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          deleted.push(id);
          users.delete(id);
          return { error: null };
        },
        getUserById: async (id: string) => ({ data: { user: users.get(id) ?? null }, error: null }),
        updateUserById: async (id: string, input: { password?: string; app_metadata?: Row }) => {
          const user = users.get(id)!;
          if (input.password) user.password = input.password;
          if (input.app_metadata) user.app_metadata = input.app_metadata;
          return { error: null };
        },
      },
    },
  };
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => memoryDb(),
  requireSgaWriterFor: async () => ({ schoolId: S, appRole: "Secretaria" }),
  requireSgaWriterForWrite: async () => ({ schoolId: S, appRole: "Secretaria" }),
}));
vi.mock("@/features/audit/record-audit", () => ({
  recordAccessAudit: async () => undefined,
  recordAuditBatch: async () => undefined,
}));
vi.mock("@/features/school/settings-domains", () => ({
  readSettingsDomain: async () => ({ student_number_login: true }),
}));
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
        (h: (ctx: { data: unknown; context: Row }) => unknown) =>
        (call?: { data: unknown }) =>
          h({ data: fn.parse(call?.data), context: { userId: "staff", claims, supabase: {} } }),
      parse: (input: unknown) => input,
    };
    return fn;
  },
}));

const server = await import("@/features/students/student-accounts-server");
const firstPassword = await import("@/features/auth/first-password-server");

const ST1 = "00000000-0000-0000-0000-0000000000b1";
const ST2 = "00000000-0000-0000-0000-0000000000b2";
const ST3 = "00000000-0000-0000-0000-0000000000b3";

beforeEach(() => {
  claims = { aal: "aal2" };
  users = new Map();
  failLinking = false;
  deleted.length = 0;
  tables = {
    schools: [{ id: S, public_code: "SIGA-AO-000001" }],
    roles: [
      { id: "r-student", school_id: S, code: "student" },
      { id: "r-teacher", school_id: S, code: "teacher" },
    ],
    students: [
      { id: ST1, school_id: S, person_id: "p1", student_number: "1260001", status: "active" },
      { id: ST2, school_id: S, person_id: "p2", student_number: null, status: "active" },
      { id: ST3, school_id: S, person_id: "p3", student_number: "1260003", status: "transferred" },
    ],
    people: [
      { id: "p1", school_id: S, full_name: "Ana Tchipa", user_id: null },
      { id: "p2", school_id: S, full_name: "Bento Lussati", user_id: null },
      { id: "p3", school_id: S, full_name: "Carla Mbala", user_id: null },
    ],
    profiles: [],
    school_memberships: [],
    member_roles: [],
  };
});

describe("contas de acesso dos alunos", () => {
  it("cria a conta com senha provisória, papel de aluno e ficha ligada", async () => {
    const result = await server.createStudentAccounts({ data: { studentIds: [ST1] } });
    expect(result.failed).toEqual([]);
    const [credential] = result.issued;
    expect(credential).toMatchObject({ studentId: ST1, studentNumber: "1260001", name: "Ana Tchipa" });
    expect(credential!.password).toMatch(/^[A-Z]{4}-[2-9]{4}-[a-z]{2}$/);

    const [user] = [...users.values()];
    expect(user).toMatchObject({
      email: "1260001.sigaao000001@alunos.portal-siga.com",
      app_metadata: { must_change_password: true, account_kind: "student" },
      password: credential!.password,
    });
    expect(tables.people!.find((p) => p.id === "p1")!.user_id).toBe(user!.id);
    expect(tables.school_memberships).toMatchObject([{ school_id: S, user_id: user!.id }]);
    expect(tables.member_roles).toMatchObject([{ role_id: "r-student" }]);
  });

  it("sem número de aluno ou fora de activo: não cria, e diz porquê", async () => {
    const result = await server.createStudentAccounts({ data: { studentIds: [ST2, ST3] } });
    expect(result.issued).toEqual([]);
    expect(result.failed.map((item) => item.message)).toEqual([
      "O aluno não tem número de aluno.",
      "O aluno não está activo nesta escola.",
    ]);
    expect(users.size).toBe(0);
  });

  it("se a ficha já foi ligada por outro ecrã, a conta nova é apagada (sem órfãs)", async () => {
    failLinking = true;
    const result = await server.createStudentAccounts({ data: { studentIds: [ST1] } });
    expect(result.failed[0]!.message).toContain("já tem conta");
    expect(deleted).toHaveLength(1);
    expect(users.size).toBe(0);
  });

  it("criar contas e dar nova senha exigem 2FA nesta sessão", async () => {
    claims = { aal: "aal1" };
    await expect(
      Promise.resolve().then(() => server.createStudentAccounts({ data: { studentIds: [ST1] } })),
    ).rejects.toThrow("2FA");
    await expect(
      Promise.resolve().then(() => server.resetStudentPassword({ data: { studentId: ST1 } })),
    ).rejects.toThrow("2FA");
  });

  it("nova senha: só a contas que são apenas de aluno nesta escola", async () => {
    await server.createStudentAccounts({ data: { studentIds: [ST1] } });
    const [user] = [...users.values()];
    user!.app_metadata = { must_change_password: false, account_kind: "student" };
    const credential = await server.resetStudentPassword({ data: { studentId: ST1 } });
    expect(user!.password).toBe(credential.password);
    expect(user!.app_metadata).toMatchObject({ must_change_password: true });

    // A mesma conta passa a ser também de professor: a Secretaria já não lhe muda a senha.
    tables.member_roles!.push({ school_id: S, membership_id: "school_memberships-1", role_id: "r-teacher" });
    await expect(server.resetStudentPassword({ data: { studentId: ST1 } })).rejects.toThrow(
      "não é só de aluno",
    );
  });

  it("primeiro acesso: troca a senha e desliga o sinal; sem o sinal, recusa", async () => {
    await server.createStudentAccounts({ data: { studentIds: [ST1] } });
    const [user] = [...users.values()];
    // O próprio aluno, autenticado.
    const call = (password: string) =>
      Promise.resolve().then(() =>
        firstPassword.completeFirstPasswordChange({ data: { password } }),
      );
    // O mock usa userId "staff": aponta a conta do aluno para esse id.
    users.set("staff", { ...user!, id: "staff" });
    await expect(call("fraca")).rejects.toThrow("pelo menos 8");
    await call("NovaSenha2026");
    expect(users.get("staff")).toMatchObject({
      password: "NovaSenha2026",
      app_metadata: { must_change_password: false, account_kind: "student" },
    });
    await expect(call("OutraSenha2026")).rejects.toThrow("já tem senha própria");
  });
});
