import { describe, expect, it } from "vitest";
import {
  insertTeacherWithNextNumber,
  nextTeacherEmployeeNumber,
} from "@/features/people/teacher-number";

type Db = Parameters<typeof nextTeacherEmployeeNumber>[0];

/** Só o que a numeração lê: `teachers.employee_number` da escola. */
function fakeDb(numbers: string[]): Db {
  const query = {
    select: () => query,
    eq: () => query,
    ilike: () =>
      Promise.resolve({
        data: numbers.map((employee_number) => ({ employee_number })),
        error: null,
      }),
  };
  return { from: () => query } as unknown as Db;
}

describe("número do professor", () => {
  it("começa em DOC-000001", async () => {
    expect(await nextTeacherEmployeeNumber(fakeDb([]), "s")).toBe("DOC-000001");
  });

  it("usa o maior número + 1, não a contagem (com saltos, a contagem repetia um número)", async () => {
    // 3 professores, um deles importado com outro formato: a contagem dava DOC-000004,
    // que já existe.
    const db = fakeDb(["DOC-000001", "DOC-000004", "DOC-9F3A61C2B0"]);
    expect(await nextTeacherEmployeeNumber(db, "s")).toBe("DOC-000005");
  });

  it("tenta de novo quando outro pedido ficou com o número", async () => {
    const numbers = ["DOC-000001"];
    const tried: string[] = [];
    const result = await insertTeacherWithNextNumber(fakeDb(numbers), "s", async (number) => {
      tried.push(number);
      if (tried.length === 1) {
        numbers.push(number); // o pedido concorrente gravou-o primeiro
        return {
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "teachers_school_id_employee_number_key"',
          },
        };
      }
      return { data: { id: "t1" }, error: null };
    });
    expect(result.error).toBeNull();
    expect(tried).toEqual(["DOC-000002", "DOC-000003"]);
  });

  it("não repete outros erros", async () => {
    let calls = 0;
    const result = await insertTeacherWithNextNumber(fakeDb([]), "s", async () => {
      calls += 1;
      return { data: null, error: { code: "23503", message: "foreign key" } };
    });
    expect(calls).toBe(1);
    expect(result.error?.code).toBe("23503");
  });
});
