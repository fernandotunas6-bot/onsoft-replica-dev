import { describe, expect, it } from "vitest";
import { absenceByEnrollment } from "@/features/academic/exam-data";

/**
 * Faltas da pauta, dos exames e do histórico. Uma aula é uma linha por tempo lectivo:
 * uma turma com 30 tempos por semana passa as 1000 aulas no ano, e o PostgREST
 * devolve no máximo 1000 linhas por pedido, sem erro. O pedido antigo lia só essas,
 * e um erro de leitura deixava cair para os 0% gravados na pauta.
 */
type Row = Record<string, unknown>;
type Failure = { table: string; error: { code?: string; message: string } };

const MAX_ROWS = 1000;

function fakeDb(tables: Record<string, Row[]>, failure?: Failure) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let range: [number, number] | null = null;
      let ordered = false;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        order: () => {
          ordered = true;
          return query;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          return query;
        },
        limit: () => query,
        then(resolve: (value: { data: Row[] | null; error: unknown }) => void) {
          if (failure?.table === table) return resolve({ data: null, error: failure.error });
          let rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          if (ordered) rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          resolve({ data: rows.slice(0, MAX_ROWS), error: null });
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof absenceByEnrollment>[0];
}

const SCHOOL = "school";
const YEAR = "year";
const CLASS = "class";
const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, "0")}`;

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
