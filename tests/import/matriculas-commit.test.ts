import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matriculasImporter } from "@/features/import/importers/matriculas-importer";
import type { ImportCommitContext } from "@/features/import/engine/types";

/**
 * A matrícula nova tem de passar por `enroll_student`: é essa função que gera o
 * `enrollment_number` (NOT NULL). O insert directo que o importador fazia omitia-o
 * e a base recusava todas as linhas.
 */
const YEAR = "year-2026";

function cache() {
  return {
    existingPeople: [],
    classGroups: [{ id: "g-10a", name: "10A" }],
    studentByPersonId: new Map(),
    academicYearId: YEAR,
    students: [
      { id: "s-1", person_id: "p-1", student_number: "P-001", national_id: null, status: "active" },
    ],
    groups: [{ id: "g-10a", code: "10A", name: "10A", academic_year_id: YEAR }],
    enrollmentByStudent: new Map(),
  };
}

function context(rpc: ReturnType<typeof vi.fn>): ImportCommitContext {
  const insert = vi.fn(() => {
    throw new Error("o importador não deve inserir matrículas directamente");
  });
  return {
    db: { from: () => ({ insert }) } as unknown as SupabaseClient,
    sessionSupabase: { rpc } as unknown as SupabaseClient,
    schoolId: "school-1",
    academicYearId: YEAR,
    userId: "user-1",
    duplicateStrategy: "update",
    dryRun: false,
  };
}

const row = { processo: "P-001", turma: "10A", data_matricula: "2026-02-10" };

describe("importador de matrículas: gravação", () => {
  it("cria a matrícula por enroll_student e guarda-a na cache", async () => {
    const rpc = vi.fn(async () => ({
      data: { enrollmentId: "e-1", enrollmentNumber: "MAT-000001", status: "active" },
      error: null,
    }));
    const refs = cache();
    const result = await matriculasImporter.commitRow(row, context(rpc), refs);

    expect(rpc).toHaveBeenCalledWith("enroll_student", {
      school_id: "school-1",
      student_id: "s-1",
      class_group_id: "g-10a",
      enrolled_on: "2026-02-10",
    });
    expect(result).toMatchObject({ status: "imported", target_record_id: "e-1", errors: [] });
    expect(refs.enrollmentByStudent.get("s-1")).toMatchObject({
      id: "e-1",
      class_group_id: "g-10a",
      academic_year_id: YEAR,
    });
  });

  it("sem 2FA a linha falha com a explicação certa", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "42501", message: "Sem autorização para matricular estudantes." },
    }));
    const result = await matriculasImporter.commitRow(row, context(rpc), cache());
    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("2FA");
  });

  it("devolve o erro da base (ex.: turma cheia)", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "23514", message: "A turma atingiu a capacidade configurada." },
    }));
    const result = await matriculasImporter.commitRow(row, context(rpc), cache());
    expect(result).toMatchObject({
      status: "error",
      errors: ["A turma atingiu a capacidade configurada."],
    });
  });
});

describe("importador de matrículas: só a matrícula corrente conta (auditoria 14)", () => {
  it("uma matrícula anulada não fica no lugar da corrente", async () => {
    const { memoryDb } = await import("../students/memory-db");
    const store = memoryDb({
      students: [
        {
          id: "s-1",
          school_id: "school-1",
          person_id: "p-1",
          student_number: "P-001",
          status: "active",
        },
      ],
      people: [],
      class_groups: [
        { id: "g-10a", school_id: "school-1", code: "10A", name: "10A", academic_year_id: YEAR },
      ],
      enrollments: [
        {
          id: "anulada",
          school_id: "school-1",
          student_id: "s-1",
          academic_year_id: YEAR,
          class_group_id: "g-10a",
          status: "cancelled",
        },
      ],
    });
    const refs = (await matriculasImporter.loadRefCache({
      ...context(vi.fn()),
      db: store.db,
    })) as ReturnType<typeof cache>;
    expect(refs.enrollmentByStudent.size).toBe(0);
    expect(matriculasImporter.analyzeRow(row, refs).status).toBe("valid");
  });

  it("aluno suspenso sem matrícula: a linha diz porquê", () => {
    const refs = cache();
    refs.students[0]!.status = "suspended";
    expect(matriculasImporter.analyzeRow(row, refs)).toMatchObject({
      status: "error",
      errors: [expect.stringMatching(/suspenso/)],
    });
  });

  it("quem tinha saído é reaberto, matriculado e fica activo", async () => {
    const { memoryDb } = await import("../students/memory-db");
    const store = memoryDb({
      students: [{ id: "s-1", school_id: "school-1", status: "inactive" }],
      student_status_history: [],
    });
    const rpc = vi.fn(async () => {
      expect(store.tables["students"]![0]!["status"]).toBe("applicant");
      store.tables["students"]![0]!["status"] = "active";
      return {
        data: { enrollmentId: "e-2", enrollmentNumber: "MAT-000002", status: "active" },
        error: null,
      };
    });
    const refs = cache();
    refs.students[0]!.status = "inactive";
    const result = await matriculasImporter.commitRow(row, { ...context(rpc), db: store.db }, refs);
    expect(result).toMatchObject({ status: "imported", target_record_id: "e-2" });
    expect(store.tables["student_status_history"]).toEqual([
      expect.objectContaining({ previous_status: "inactive", new_status: "active" }),
    ]);
    expect(refs.students[0]!.status).toBe("active");
  });
});
