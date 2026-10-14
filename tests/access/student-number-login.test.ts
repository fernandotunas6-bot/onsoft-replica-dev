import { describe, expect, it } from "vitest";
import {
  normalizeStudentNumber,
  resolveStudentNumberLogin,
  schoolIdForHost,
} from "@/features/access/student-number-login";

type Row = Record<string, unknown>;

/** Base em memória com o pouco do PostgREST que o login usa. */
function fakeDb(tables: Record<string, Row[]>, users: Record<string, string>) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[column]));
        return builder;
      },
      is: (column: string, value: unknown) => {
        rows = rows.filter((r) => (r[column] ?? null) === value);
        return builder;
      },
      not: (column: string, _op: string, value: unknown) => {
        rows = rows.filter((r) => (r[column] ?? null) !== value);
        return builder;
      },
      limit: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    from,
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: users[id] ? { email: users[id] } : null },
          error: null,
        }),
      },
    },
  } as never;
}

const A = "school-a";
const B = "school-b";
const on = (school: string) => ({
  school_id: school,
  domain: "student_access",
  value: { student_number_login: true },
});
const student = (school: string, person: string, number = "1260001", status = "active") => ({
  school_id: school,
  person_id: person,
  student_number: number,
  status,
  deleted_at: null,
});
const person = (id: string, school: string, user: string | null) => ({
  id,
  school_id: school,
  user_id: user,
  deleted_at: null,
});
const users = { ua: "Ana@Escola.ao", ub: "bruno@outra.ao" };

describe("número de aluno", () => {
  it("aceita só 1 + ano + 4 dígitos, com espaços ou traços", () => {
    expect(normalizeStudentNumber("1260001")).toBe("1260001");
    expect(normalizeStudentNumber(" 126 0001 ")).toBe("1260001");
    expect(normalizeStudentNumber("126-0001")).toBe("1260001");
    expect(normalizeStudentNumber("12600011")).toBeNull();
    expect(normalizeStudentNumber("2260001")).toBeNull();
    expect(normalizeStudentNumber("EST-000001")).toBeNull();
    expect(normalizeStudentNumber("923456789")).toBeNull(); // telefone
    expect(normalizeStudentNumber("004212984LA042")).toBeNull(); // B.I.
  });
});

describe("entrar com o número de aluno", () => {
  const tables = {
    students: [student(A, "pa"), student(B, "pb")],
    people: [person("pa", A, "ua"), person("pb", B, "ub")],
    school_settings: [on(A)],
  };

  it("a escola do endereço com a opção ligada: e-mail da conta", async () => {
    expect(await resolveStudentNumberLogin(fakeDb(tables, users), "1260001", A)).toEqual({
      email: "ana@escola.ao",
    });
  });

  it("opção desligada (por omissão): não serve", async () => {
    expect(await resolveStudentNumberLogin(fakeDb(tables, users), "1260001", B)).toBeNull();
  });

  it("endereço geral: só a escola com a opção ligada conta", async () => {
    expect(await resolveStudentNumberLogin(fakeDb(tables, users), "1260001", null)).toEqual({
      email: "ana@escola.ao",
    });
  });

  it("endereço geral com duas escolas ligadas: pede o endereço da escola", async () => {
    const both = { ...tables, school_settings: [on(A), on(B)] };
    expect(await resolveStudentNumberLogin(fakeDb(both, users), "1260001", null)).toEqual({
      error: "school_required",
    });
  });

  it("sem conta ligada, ficha anulada ou de outra escola: não serve", async () => {
    const noAccount = { ...tables, people: [person("pa", A, null)] };
    expect(await resolveStudentNumberLogin(fakeDb(noAccount, users), "1260001", A)).toBeNull();
    const withdrawn = { ...tables, students: [student(A, "pa", "1260001", "withdrawn")] };
    expect(await resolveStudentNumberLogin(fakeDb(withdrawn, users), "1260001", A)).toBeNull();
    // A pessoa ligada é de outra escola: a ficha não é desta conta.
    const crossed = { ...tables, people: [person("pa", B, "ua")] };
    expect(await resolveStudentNumberLogin(fakeDb(crossed, users), "1260001", A)).toBeNull();
  });

  it("número desconhecido: segue para o B.I.", async () => {
    expect(await resolveStudentNumberLogin(fakeDb(tables, users), "1269999", A)).toBeNull();
  });
});

describe("escola do endereço", () => {
  const tables = {
    tenants: [{ id: "t1", slug: "colegio" }],
    tenant_domains: [{ tenant_id: "t1", hostname: "colegio.ao", status: "active" }],
    schools: [{ id: A, tenant_id: "t1" }],
  };
  it("subdomínio da plataforma e domínio próprio", async () => {
    const db = fakeDb(tables, {});
    expect(await schoolIdForHost(db, "colegio.portal-siga.com")).toBe(A);
    expect(await schoolIdForHost(db, "colegio.ao:443")).toBe(A);
  });
  it("endereço geral, local ou desconhecido: nenhuma", async () => {
    const db = fakeDb(tables, {});
    expect(await schoolIdForHost(db, "portal-siga.com")).toBeNull();
    expect(await schoolIdForHost(db, "localhost")).toBeNull();
    expect(await schoolIdForHost(db, "outra.ao")).toBeNull();
    expect(await schoolIdForHost(db, null)).toBeNull();
  });
});
