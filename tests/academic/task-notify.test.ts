import { beforeEach, describe, expect, it } from "vitest";
import { notifyTaskReturned, taskReturnedMessage } from "@/features/academic/task-notify";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let failOn: string | null = null;

function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let inserted: Row[] | null = null;
      const run = () => {
        if (failOn === table) throw new Error("base em baixo");
        if (inserted) {
          (tables[table] ??= []).push(...inserted);
          return { data: null, error: null };
        }
        return {
          data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
          error: null,
        };
      };
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        insert: (rows: Row[]) => {
          inserted = rows;
          return chain;
        },
        maybeSingle: () => {
          const result = run();
          return Promise.resolve({ data: (result.data as Row[] | null)?.[0] ?? null, error: null });
        },
        then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
          try {
            return resolve(run());
          } catch (error) {
            return reject?.(error);
          }
        },
      };
      return chain;
    },
  };
}

const S = "school";
const input = {
  schoolId: S,
  taskId: "task-1",
  taskTitle: "Resumo do cap. 3",
  subjectId: "mat",
  enrollmentId: "e1",
  grade: 15.5,
  feedback: "Bom trabalho",
  toPauta: true,
};

beforeEach(() => {
  failOn = null;
  tables = {
    enrollments: [{ id: "e1", school_id: S, student_id: "st1" }],
    students: [{ id: "st1", school_id: S, person_id: "p-ana" }],
    subjects: [{ id: "mat", name: "Matemática" }],
    student_guardians: [
      { school_id: S, student_id: "st1", guardian_person_id: "p-mae" },
      { school_id: S, student_id: "st1", guardian_person_id: "p-pai" },
      // O pai tem outro educando na escola.
      { school_id: S, student_id: "st2", guardian_person_id: "p-pai" },
    ],
    people: [
      { id: "p-ana", school_id: S, user_id: "u-ana", full_name: "Ana Silva" },
      { id: "p-mae", school_id: S, user_id: "u-mae", full_name: "Maria Silva" },
      { id: "p-pai", school_id: S, user_id: "u-pai", full_name: "João Silva" },
    ],
  };
});

describe("aviso de trabalho devolvido", () => {
  it("o texto leva a nota, se já está na pauta, e o início do comentário", () => {
    expect(taskReturnedMessage(input)).toBe(
      "Resumo do cap. 3: 15,5 valores, já na pauta. «Bom trabalho»",
    );
    expect(taskReturnedMessage({ ...input, grade: null, feedback: null, toPauta: false })).toBe(
      "Resumo do cap. 3: o professor devolveu o trabalho.",
    );
    const long = taskReturnedMessage({ ...input, feedback: "x".repeat(300) });
    expect(long.length).toBeLessThan(200);
    expect(long).toContain("…»");
  });

  it("avisa o aluno e cada encarregado; quem tem vários educandos vai às Notas", async () => {
    expect(await notifyTaskReturned(memoryDb() as never, input)).toBe(3);
    const sent = tables.notifications!;
    const byUser = Object.fromEntries(sent.map((row) => [row.user_id, row]));
    expect(byUser["u-ana"]).toMatchObject({
      channel: "in_app",
      event_type: "academic.task.returned",
      title: "Trabalho devolvido: Matemática",
      payload: { taskId: "task-1", href: "/pedagogica/disciplinas/mat" },
    });
    expect(byUser["u-mae"]).toMatchObject({
      title: "Matemática: trabalho de Ana devolvido",
      payload: { href: "/pedagogica/disciplinas/mat" },
    });
    expect(byUser["u-pai"]).toMatchObject({ payload: { href: "/pedagogica" } });
  });

  it("sem conta na aplicação não há aviso; e uma falha nunca impede a devolução", async () => {
    tables.people = tables.people!.map((row) => ({ ...row, user_id: null }));
    expect(await notifyTaskReturned(memoryDb() as never, input)).toBe(0);
    failOn = "people";
    expect(await notifyTaskReturned(memoryDb() as never, input)).toBe(0);
  });
});
