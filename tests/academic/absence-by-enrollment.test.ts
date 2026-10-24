import { describe, expect, it } from "vitest";
import { absenceByEnrollment } from "@/features/academic/exam-data";
import { fakeId, fakePostgrest } from "../helpers/fake-postgrest";

/**
 * Faltas da pauta, dos exames e do histórico. Uma aula é uma linha por tempo lectivo:
 * uma turma com 30 tempos por semana passa as 1000 aulas no ano, e o PostgREST
 * devolve no máximo 1000 linhas por pedido, sem erro. O pedido antigo lia só essas,
 * e um erro de leitura deixava cair para os 0% gravados na pauta.
 */
const fakeDb = (...args: Parameters<typeof fakePostgrest>) =>
  fakePostgrest(...args).client as unknown as Parameters<typeof absenceByEnrollment>[0];

const SCHOOL = "school";
const YEAR = "year";
const CLASS = "class";
const id = fakeId;

/** 1200 aulas: o aluno faltou às últimas 300. */
function yearOfLessons() {
  const sessions = Array.from({ length: 1200 }, (_, n) => ({
    id: id("s", n),
    school_id: SCHOOL,
    academic_year_id: YEAR,
    class_group_id: CLASS,
  }));
  const records = sessions.map((session, n) => ({
    id: id("r", n),
    school_id: SCHOOL,
    session_id: session.id,
    student_id: "student-1",
    status: n >= 900 ? "absent" : "present",
  }));
  return {
    enrollments: [{ id: "enrollment-1", school_id: SCHOOL, student_id: "student-1" }],
    siga_attendance_sessions: sessions,
    siga_attendance_records: records,
  };
}

describe("absenceByEnrollment", () => {
  it("conta todas as aulas do ano, não só as primeiras 1000", async () => {
    const result = await absenceByEnrollment(fakeDb(yearOfLessons()), SCHOOL, YEAR, CLASS, [
      "enrollment-1",
    ]);
    expect(result.get("enrollment-1")).toBe(25);
  });

  it("um erro de leitura pára, em vez de cair para os 0% da pauta", async () => {
    await expect(
      absenceByEnrollment(
        fakeDb(yearOfLessons(), {
          table: "siga_attendance_records",
          error: { code: "57014", message: "canceling statement due to statement timeout" },
        }),
        SCHOOL,
        YEAR,
        CLASS,
        ["enrollment-1"],
      ),
    ).rejects.toThrow();
  });

  it("sem a tabela das chamadas (base antiga), fica a percentagem da pauta", async () => {
    const result = await absenceByEnrollment(
      fakeDb(yearOfLessons(), {
        table: "siga_attendance_sessions",
        error: { code: "42P01", message: 'relation "siga_attendance_sessions" does not exist' },
      }),
      SCHOOL,
      YEAR,
      CLASS,
      ["enrollment-1"],
    );
    expect(result.size).toBe(0);
  });
});
