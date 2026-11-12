import { describe, expect, it } from "vitest";
import { TEACHER_EDIT_CONFLICT, commitTeacherUpdate } from "@/features/people/teacher-update";
import { memoryDb } from "../students/memory-db";

const SCHOOL = "escola-a";
const T_AT = "2026-10-29T08:00:00.123456+00:00";
const P_AT = "2026-10-29T07:00:00.654321+00:00";

function fixture(overrides: { teacher?: Record<string, unknown> } = {}) {
  return memoryDb({
    teachers: [
      {
        id: "prof-1",
        school_id: SCHOOL,
        person_id: "pessoa-1",
        status: "active",
        updated_at: T_AT,
        ...overrides.teacher,
      },
    ],
    people: [
      {
        id: "pessoa-1",
        school_id: SCHOOL,
        full_name: "Maria Lopes",
        email: "maria@escola.ao",
        phone: "+244923000000",
        updated_at: P_AT,
      },
    ],
  });
}

const input = {
  schoolId: SCHOOL,
  userId: "secretaria",
  teacherId: "prof-1",
  fullName: "Maria Lopes",
  email: "maria@escola.ao",
  phone: "+244923000000",
  status: "active" as const,
  expectedTeacherUpdatedAt: T_AT,
  expectedPersonUpdatedAt: P_AT,
};

describe("editar professor — duas tabelas sem meia gravação", () => {
  it("guardar sem alterações não escreve", async () => {
    const store = fixture();
    const result = await commitTeacherUpdate(store.db, input);
    expect(result.changedFields).toEqual([]);
    expect(store.writes).toEqual([]);
  });

  it("grava nome e estado e diz o que mudou", async () => {
    const store = fixture();
    const result = await commitTeacherUpdate(store.db, {
      ...input,
      fullName: "Maria J. Lopes",
      status: "inactive",
    });
    expect(result).toMatchObject({ status: "inactive", changedFields: ["full_name", "status"] });
    expect(store.tables["people"]?.[0]?.["full_name"]).toBe("Maria J. Lopes");
    expect(store.tables["teachers"]?.[0]?.["status"]).toBe("inactive");
  });

  it("aceita o mesmo instante noutro formato", async () => {
    const store = fixture({ teacher: { updated_at: "2026-10-29T08:00:00Z" } });
    await expect(
      commitTeacherUpdate(store.db, {
        ...input,
        expectedTeacherUpdatedAt: "2026-10-29T08:00:00.000Z",
      }),
    ).resolves.toMatchObject({ changedFields: [] });
  });

  it("outra pessoa gravou o professor ou a ficha: conflito, nada escrito", async () => {
    for (const stale of [
      { expectedTeacherUpdatedAt: "2026-10-28T08:00:00+00:00" },
      { expectedPersonUpdatedAt: "2026-10-28T07:00:00+00:00" },
    ]) {
      const store = fixture();
      await expect(
        commitTeacherUpdate(store.db, { ...input, ...stale, fullName: "Outro nome" }),
      ).rejects.toThrow(TEACHER_EDIT_CONFLICT);
      expect(store.writes).toEqual([]);
    }
  });

  it("estado mudado por outra sessão a meio: repõe a ficha e devolve conflito", async () => {
    const store = fixture();
    const db = store.db as unknown as { from: (table: string) => Record<string, unknown> };
    const original = db.from.bind(db);
    // Entre a leitura e a escrita, outra sessão desactiva o professor.
    let teacherReads = 0;
    (db as { from: unknown }).from = (table: string) => {
      const chain = original(table);
      if (table === "teachers") {
        const maybeSingle = chain["maybeSingle"] as () => Promise<unknown>;
        chain["maybeSingle"] = async () => {
          const result = await maybeSingle();
          if (++teacherReads === 1) store.tables["teachers"]![0]!["status"] = "inactive";
          return result;
        };
      }
      return chain;
    };
    await expect(
      commitTeacherUpdate(store.db, { ...input, fullName: "Maria J. Lopes", status: "inactive" }),
    ).rejects.toThrow(TEACHER_EDIT_CONFLICT);
    expect(store.tables["people"]?.[0]?.["full_name"]).toBe("Maria Lopes");
  });

  it("professor de outra escola não é encontrado", async () => {
    const store = fixture({ teacher: { school_id: "escola-b" } });
    await expect(commitTeacherUpdate(store.db, input)).rejects.toThrow(/não encontrado/);
    expect(store.writes).toEqual([]);
  });
});
