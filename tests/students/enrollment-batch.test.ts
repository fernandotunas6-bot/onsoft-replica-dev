import { describe, expect, it } from "vitest";
import {
  commitExistingEnrollmentPlacements,
  type ExistingEnrollmentRow,
} from "@/features/students/enrollment-batch";
import { memoryDb } from "./memory-db";

const SCHOOL = "escola-a";
const CLASS_A = "turma-a";
const CLASS_B = "turma-b";

function sample(overrides: Partial<ExistingEnrollmentRow> = {}): ExistingEnrollmentRow {
  return {
    id: "mat-1",
    student_id: "aluno-1",
    class_group_id: CLASS_A,
    status: "active",
    ...overrides,
  };
}

function fixture(enrollments: Array<ExistingEnrollmentRow & { school_id?: string }>) {
  const db = memoryDb({
    enrollments: enrollments.map((enrollment) => ({
      ...enrollment,
      school_id: enrollment.school_id ?? SCHOOL,
    })),
  });
  const place = (rows: readonly ExistingEnrollmentRow[], client = db.db) =>
    commitExistingEnrollmentPlacements(client, {
      schoolId: SCHOOL,
      targetClassGroupId: CLASS_B,
      userId: "secretaria",
      rows,
    });
  return { ...db, place };
}

describe("matrículas existentes em lote — CAS e resultados parciais", () => {
  it("repetição da turma já activa não regrava nem duplica matrícula", async () => {
    const row = sample({ class_group_id: CLASS_B });
    const store = fixture([row]);
    expect(await store.place([row])).toEqual({ placedIds: ["aluno-1"], failed: [] });
    expect(await store.place([row])).toEqual({ placedIds: ["aluno-1"], failed: [] });
    expect(store.writes).toEqual([]);
    expect(store.tables["enrollments"]).toHaveLength(1);
  });

  it("confirma a matrícula pendente no mesmo lugar sem alterar a identidade", async () => {
    const row = sample({ class_group_id: CLASS_B, status: "pending" });
    const store = fixture([row]);
    const result = await store.place([row]);
    expect(result).toEqual({ placedIds: ["aluno-1"], failed: [] });
    expect(store.tables["enrollments"]?.[0]).toMatchObject({
      id: "mat-1",
      class_group_id: CLASS_B,
      status: "active",
    });
    expect(store.writes.filter((write) => write.table === "enrollments")).toHaveLength(1);
  });

  it("muda apenas a matrícula observada para a turma seleccionada", async () => {
    const row = sample();
    const store = fixture([row]);
    expect(await store.place([row])).toEqual({ placedIds: ["aluno-1"], failed: [] });
    expect(store.tables["enrollments"]?.[0]).toMatchObject({
      id: "mat-1",
      class_group_id: CLASS_B,
      status: "active",
      updated_by: "secretaria",
    });
  });

  it("não modifica uma matrícula de outra escola", async () => {
    const row = sample();
    const store = fixture([{ ...row, school_id: "escola-b" }]);
    const result = await store.place([row]);
    expect(result.placedIds).toEqual([]);
    expect(result.failed).toEqual([
      expect.objectContaining({ studentId: "aluno-1", message: expect.stringMatching(/outra sessão/) }),
    ]);
    expect(store.tables["enrollments"]?.[0]?.["class_group_id"]).toBe(CLASS_A);
  });

  it("não sobrepõe mudança concorrente nem conta o aluno como colocado", async () => {
    const row = sample();
    const store = fixture([row]);
    const originalFrom = (
      store.db as unknown as {
        from: (table: string) => { update: (patch: Record<string, unknown>) => unknown };
      }
    ).from;

    const racedDb = {
      from(table: string) {
        const query = originalFrom(table);
        return new Proxy(query, {
          get(target, key) {
            if (table === "enrollments" && key === "update") {
              return (patch: Record<string, unknown>) => {
                store.tables["enrollments"]![0]!["class_group_id"] = "turma-c";
                return target.update(patch);
              };
            }
            return Reflect.get(target, key);
          },
        });
      },
    };

    const result = await store.place([row], racedDb as never);
    expect(result.placedIds).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.message).toMatch(/alterada por outra sessão/);
    expect(store.tables["enrollments"]?.[0]?.["class_group_id"]).toBe("turma-c");
    expect(store.writes[0]?.rows).toEqual([]);
  });

  it("distingue êxito parcial de falha e não mexe noutra escola", async () => {
    const first = sample({ id: "mat-a", student_id: "aluno-a" });
    const second = sample({ id: "mat-b", student_id: "aluno-b" });
    const store = fixture([first, { ...second, school_id: "escola-b" }]);

    const result = await store.place([first, second]);
    expect(result.placedIds).toEqual(["aluno-a"]);
    expect(result.failed).toEqual([
      expect.objectContaining({ studentId: "aluno-b" }),
    ]);
    expect(store.tables["enrollments"]?.[0]?.["class_group_id"]).toBe(CLASS_B);
    expect(store.tables["enrollments"]?.[1]?.["class_group_id"]).toBe(CLASS_A);
  });
});
