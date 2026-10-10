import { describe, expect, it, vi } from "vitest";
import {
  ENROLLMENT_2FA_MESSAGE,
  assertClassAcceptsEnrollment,
  isRpcAuthDenied,
  placeStudentInClass,
  studentStatusAfterPlacement,
} from "@/features/students/enrollment-core";
import { memoryDb } from "./memory-db";

/**
 * Auditoria 14: «colocar ou mudar de turma» tinha três caminhos (ficha, lista,
 * lote) com regras diferentes. Agora é uma só função; estes testes descrevem-na.
 */
const SCHOOL = "school-a";
const YEAR = "year-2026";
const today = new Date().toISOString().slice(0, 10);

function fixture(student: { status: string }, enrollments: Array<Record<string, unknown>> = []) {
  return memoryDb({
    class_groups: [
      {
        id: "turma-a",
        school_id: SCHOOL,
        name: "10A",
        academic_year_id: YEAR,
        status: "active",
        capacity: 2,
      },
      {
        id: "turma-b",
        school_id: SCHOOL,
        name: "10B",
        academic_year_id: YEAR,
        status: "active",
        capacity: 30,
      },
      {
        id: "turma-velha",
        school_id: SCHOOL,
        name: "9A",
        academic_year_id: "year-2025",
        status: "active",
        capacity: 30,
      },
    ],
    academic_years: [
      {
        id: YEAR,
        school_id: SCHOOL,
        name: "2026/2027",
        status: "active",
        starts_on: "2000-01-01",
        ends_on: "2999-12-31",
      },
      {
        id: "year-2025",
        school_id: SCHOOL,
        name: "2025/2026",
        status: "closed",
        starts_on: "2000-01-01",
        ends_on: "2999-12-31",
      },
    ],
    students: [{ id: "aluno-1", school_id: SCHOOL, ...student }],
    enrollments: enrollments.map((row) => ({ school_id: SCHOOL, student_id: "aluno-1", ...row })),
    student_status_history: [],
  });
}

/** `enroll_student` em miniatura: só candidatos e activos, e promove o candidato. */
function enrollRpc(
  store: ReturnType<typeof fixture>,
  failWith?: { code: string; message: string },
) {
  return vi.fn(async (_fn: string, args: Record<string, unknown>) => {
    if (failWith) return { data: null, error: failWith };
    const student = store.tables["students"]!.find((row) => row["id"] === args["student_id"]);
    if (!student || !["applicant", "active"].includes(String(student["status"]))) {
      return {
        data: null,
        error: { code: "22023", message: "Estudante, ano letivo ou data de matrícula inválida." },
      };
    }
    store.tables["enrollments"]!.push({
      id: "nova",
      school_id: SCHOOL,
      student_id: args["student_id"],
      class_group_id: args["class_group_id"],
      academic_year_id: YEAR,
      status: "active",
    });
    if (student["status"] === "applicant") student["status"] = "active";
    return {
      data: {
        enrollmentId: "nova",
        enrollmentNumber: "MAT-000009",
        classGroupId: args["class_group_id"],
        status: "active",
      },
      error: null,
    };
  });
}

const place = (
  store: ReturnType<typeof fixture>,
  rpc: ReturnType<typeof vi.fn>,
  extra: Partial<Parameters<typeof placeStudentInClass>[2]> = {},
) =>
  placeStudentInClass(store.db, { rpc } as never, {
    schoolId: SCHOOL,
    studentId: "aluno-1",
    classGroupId: "turma-b",
    userId: "secretaria",
    hasAal2: true,
    ...extra,
  });

const statusOf = (store: ReturnType<typeof fixture>) => store.tables["students"]![0]!["status"];

describe("recusa por falta de 2FA: uma só regra", () => {
  it("reconhece as formas que a base usa", () => {
    expect(isRpcAuthDenied({ code: "42501", message: "x" })).toBe(true);
    expect(isRpcAuthDenied({ message: "Sem autorização para matricular estudantes." })).toBe(true);
    expect(isRpcAuthDenied({ message: "sem autorizacao" })).toBe(true);
    expect(isRpcAuthDenied({ message: "permission denied for function is_aal2" })).toBe(true);
    expect(isRpcAuthDenied({ code: "23514", message: "A turma atingiu a capacidade" })).toBe(false);
    expect(isRpcAuthDenied(null)).toBe(false);
  });
});

describe("colocar em turma", () => {
  it("com matrícula no ano, muda a turma na mesma matrícula e activa o candidato", async () => {
    const store = fixture({ status: "applicant" }, [
      { id: "mat-1", class_group_id: "turma-a", academic_year_id: YEAR, status: "pending" },
    ]);
    const rpc = enrollRpc(store);
    const result = await place(store, rpc);

    expect(rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ enrollmentId: "mat-1", moved: true, academicYearId: YEAR });
    expect(store.tables["enrollments"]![0]).toMatchObject({
      class_group_id: "turma-b",
      status: "active",
    });
    expect(statusOf(store)).toBe("active");
    expect(store.tables["student_status_history"]).toEqual([
      expect.objectContaining({ previous_status: "applicant", new_status: "active" }),
    ]);
  });

  it("mudar um aluno suspenso de turma não levanta a suspensão", async () => {
    const store = fixture({ status: "suspended" }, [
      { id: "mat-1", class_group_id: "turma-a", academic_year_id: YEAR, status: "active" },
    ]);
    await place(store, enrollRpc(store));
    expect(statusOf(store)).toBe("suspended");
    expect(store.writes.some((write) => write.table === "students")).toBe(false);
    expect(store.tables["student_status_history"]).toEqual([]);
  });

  it("uma matrícula anulada nunca é reactivada: matricula de novo", async () => {
    const store = fixture({ status: "active" }, [
      { id: "anulada", class_group_id: "turma-a", academic_year_id: YEAR, status: "cancelled" },
    ]);
    const rpc = enrollRpc(store);
    const result = await place(store, rpc);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.moved).toBe(false);
    expect(store.tables["enrollments"]![0]!["status"]).toBe("cancelled");
  });

  it("o ano é o da turma: um ano diferente vindo do ecrã é recusado antes de gravar", async () => {
    const store = fixture({ status: "active" });
    await expect(place(store, enrollRpc(store), { academicYearId: "outro-ano" })).rejects.toThrow(
      "A turma não pertence ao ano lectivo indicado.",
    );
    expect(store.writes).toEqual([]);
  });

  it("uma matrícula noutro ano não é mudada de turma: o ano novo tem matrícula própria", async () => {
    const store = fixture({ status: "active" }, [
      {
        id: "mat-2025",
        class_group_id: "turma-velha",
        academic_year_id: "year-2025",
        status: "active",
      },
    ]);
    const rpc = enrollRpc(store);
    await place(store, rpc);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(store.tables["enrollments"]![0]).toMatchObject({ class_group_id: "turma-velha" });
  });

  it("voltar a matricular quem tinha saído reactiva-o, com histórico", async () => {
    const store = fixture({ status: "inactive" });
    const rpc = enrollRpc(store);
    const result = await place(store, rpc);
    expect(result.moved).toBe(false);
    expect(statusOf(store)).toBe("active");
    expect(store.tables["student_status_history"]).toEqual([
      expect.objectContaining({ previous_status: "inactive", new_status: "active" }),
    ]);
  });

  it("se a matrícula falhar, quem tinha saído volta ao estado anterior", async () => {
    const store = fixture({ status: "transferred" });
    const rpc = enrollRpc(store, {
      code: "23514",
      message: "A turma atingiu a capacidade configurada.",
    });
    await expect(place(store, rpc)).rejects.toThrow("A turma atingiu a capacidade configurada.");
    expect(statusOf(store)).toBe("transferred");
  });

  it("suspenso sem matrícula: recusado com a razão, sem chamar a base", async () => {
    const store = fixture({ status: "locked" });
    const rpc = enrollRpc(store);
    await expect(place(store, rpc)).rejects.toThrow(/trancado/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem 2FA, a matrícula nova é recusada antes de qualquer escrita", async () => {
    const store = fixture({ status: "inactive" });
    const rpc = enrollRpc(store);
    await expect(place(store, rpc, { hasAal2: false })).rejects.toThrow(ENROLLMENT_2FA_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });
});

describe("estado depois da colocação", () => {
  it("activo, salvo suspenso e trancado", () => {
    for (const status of ["applicant", "inactive", "transferred", "graduated", "active", null]) {
      expect(studentStatusAfterPlacement(status)).toBe("active");
    }
    expect(studentStatusAfterPlacement("suspended")).toBe("suspended");
    expect(studentStatusAfterPlacement("locked")).toBe("locked");
  });
});

describe("turma validada antes de criar o aluno", () => {
  it("aceita uma turma activa com lugar, no ano activo", async () => {
    const store = fixture({ status: "applicant" });
    await expect(
      assertClassAcceptsEnrollment(store.db, {
        schoolId: SCHOOL,
        classGroupId: "turma-a",
        enrolledOn: today,
      }),
    ).resolves.toMatchObject({ id: "turma-a", academicYearId: YEAR });
  });

  it("turma cheia: a mesma mensagem de enroll_student", async () => {
    const store = fixture({ status: "applicant" }, [
      { id: "m1", student_id: "x", class_group_id: "turma-a", status: "active" },
      { id: "m2", student_id: "y", class_group_id: "turma-a", status: "pending" },
    ]);
    await expect(
      assertClassAcceptsEnrollment(store.db, { schoolId: SCHOOL, classGroupId: "turma-a" }),
    ).rejects.toThrow("A turma atingiu a capacidade configurada.");
  });

  it("ano não activo e data fora do ano dizem o que corrigir", async () => {
    const store = fixture({ status: "applicant" });
    await expect(
      assertClassAcceptsEnrollment(store.db, { schoolId: SCHOOL, classGroupId: "turma-velha" }),
    ).rejects.toThrow(/2025\/2026 não está activo/);
    await expect(
      assertClassAcceptsEnrollment(store.db, {
        schoolId: SCHOOL,
        classGroupId: "turma-a",
        enrolledOn: "3000-01-01",
      }),
    ).rejects.toThrow(/fora do ano lectivo/);
  });
});
