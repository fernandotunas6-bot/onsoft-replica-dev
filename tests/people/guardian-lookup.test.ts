import { describe, expect, it } from "vitest";
import { comparableName, findExistingGuardian } from "@/features/people/guardian-lookup";

type Db = Parameters<typeof findExistingGuardian>[0];
type Person = { id: string; full_name: string; phone: string };

/** `people` filtradas por telefone e `student_guardians` pelos ids pedidos. */
function fakeDb(people: Person[], guardianIds: string[]): Db {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        is: () => query,
        limit: () =>
          Promise.resolve({
            data: people.filter((row) => row.phone === filters["phone"]),
            error: null,
          }),
        in: (_column: string, ids: string[]) =>
          Promise.resolve({
            data: guardianIds
              .filter((id) => ids.includes(id))
              .map((id) => ({ guardian_person_id: id })),
            error: null,
          }),
      };
      void table;
      return query;
    },
  } as unknown as Db;
}

const PHONE = "+244923000000";

describe("encarregado já registado (candidatura de um irmão)", () => {
  it("compara nomes sem acentos, maiúsculas nem espaços a mais", () => {
    expect(comparableName("  Maria  JOSÉ ")).toBe(comparableName("maria jose"));
  });

  it("reaproveita a ficha com o mesmo nome e telefone que já é encarregado", async () => {
    const db = fakeDb([{ id: "g1", full_name: "Maria José", phone: PHONE }], ["g1"]);
    const id = await findExistingGuardian(db, {
      schoolId: "s",
      fullName: "maria jose",
      phone: PHONE,
    });
    expect(id).toBe("g1");
  });

  it("telefone igual com outro nome não chega (uma casa partilha o número)", async () => {
    const db = fakeDb([{ id: "g1", full_name: "Maria José", phone: PHONE }], ["g1"]);
    expect(
      await findExistingGuardian(db, { schoolId: "s", fullName: "João José", phone: PHONE }),
    ).toBeNull();
  });

  it("não reaproveita quem não é encarregado de ninguém", async () => {
    const db = fakeDb([{ id: "p1", full_name: "Maria José", phone: PHONE }], []);
    expect(
      await findExistingGuardian(db, { schoolId: "s", fullName: "Maria José", phone: PHONE }),
    ).toBeNull();
  });

  it("na dúvida (duas fichas possíveis) cria uma nova, como antes", async () => {
    const db = fakeDb(
      [
        { id: "g1", full_name: "Maria José", phone: PHONE },
        { id: "g2", full_name: "Maria Jose", phone: PHONE },
      ],
      ["g1", "g2"],
    );
    expect(
      await findExistingGuardian(db, { schoolId: "s", fullName: "Maria José", phone: PHONE }),
    ).toBeNull();
  });

  it("sem telefone não procura", async () => {
    const db = fakeDb([], []);
    expect(
      await findExistingGuardian(db, { schoolId: "s", fullName: "Maria", phone: null }),
    ).toBeNull();
  });
});
