import { describe, expect, it } from "vitest";
import { assertClassMaterialScope } from "@/features/arquivos/class-material-scope";

type Row = Record<string, unknown>;
type TableName = "teachers" | "people" | "class_subjects";

const teacher = {
  id: "teacher-a",
  school_id: "school-a",
  user_id: "user-a",
  person_id: null,
  status: "active",
};
const assignment = {
  id: "assignment-a",
  school_id: "school-a",
  class_group_id: "class-a",
  teacher_id: "teacher-a",
  status: "active",
};

function makeDb(
  input: Partial<Record<TableName, Row[]>> = {},
  errorTable?: TableName,
) {
  const rows: Record<TableName, Row[]> = {
    teachers: [teacher],
    people: [],
    class_subjects: [assignment],
    ...input,
  };
  const queries: Array<{ table: TableName; filters: Record<string, unknown> }> = [];

  const db = {
    from(table: TableName) {
      const filters: Record<string, unknown> = {};
      queries.push({ table, filters });
      let current = [...rows[table]];
      const query = {
        select(_columns: string) {
          return query;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          current = current.filter((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filters[column] = values;
          current = current.filter((row) => values.includes(row[column]));
          return query;
        },
        limit(count: number) {
          current = current.slice(0, count);
          return query;
        },
        async maybeSingle() {
          return {
            data: current[0] ?? null,
            error: errorTable === table ? { message: "Erro de consulta", code: "XX000" } : null,
          };
        },
        then<T>(
          onSuccess: (result: { data: Row[]; error: { message: string; code: string } | null }) => T,
        ) {
          return Promise.resolve({
            data: current,
            error: errorTable === table ? { message: "Erro de consulta", code: "XX000" } : null,
          }).then(onSuccess);
        },
      };
      return query;
    },
  };
  return { db: db as unknown as Parameters<typeof assertClassMaterialScope>[0], queries };
}

const request = {
  schoolId: "school-a",
  userId: "user-a",
  classGroupId: "class-a",
  roles: ["Professor"],
};

describe("materiais da turma: atribuição docente no servidor", () => {
  it("permite atribuição activa na escola e turma correctas", async () => {
    const { db, queries } = makeDb();
    await expect(assertClassMaterialScope(db, request)).resolves.toBeUndefined();
    const assignmentLookup = queries.find((query) => query.table === "class_subjects");
    expect(assignmentLookup?.filters).toMatchObject({
      school_id: "school-a",
      class_group_id: "class-a",
      status: "active",
      teacher_id: ["teacher-a"],
    });
  });

  it("nega outra turma da mesma escola, mesmo com sessão de professor", async () => {
    const { db } = makeDb();
    await expect(
      assertClassMaterialScope(db, { ...request, classGroupId: "class-b" }),
    ).rejects.toThrow(/não está atribuída/);
  });

  it("não aceita atribuição da mesma turma noutra escola", async () => {
    const { db } = makeDb({
      class_subjects: [{ ...assignment, school_id: "school-b" }],
    });
    await expect(assertClassMaterialScope(db, request)).rejects.toThrow(/não está atribuída/);
  });

  it("ignora professores e disciplinas inactivos", async () => {
    const { db: inactiveTeacher } = makeDb({ teachers: [{ ...teacher, status: "inactive" }] });
    await expect(assertClassMaterialScope(inactiveTeacher, request)).rejects.toThrow(
      /Sem atribuição docente activa/,
    );
    const { db: inactiveSubject } = makeDb({
      class_subjects: [{ ...assignment, status: "inactive" }],
    });
    await expect(assertClassMaterialScope(inactiveSubject, request)).rejects.toThrow(
      /não está atribuída/,
    );
  });

  it("aceita vínculo legado apenas através de pessoa ligada ao user_id", async () => {
    const { db } = makeDb({
      teachers: [{ ...teacher, user_id: null, person_id: "person-a" }],
      people: [{ id: "person-a", school_id: "school-a", user_id: "user-a", status: "active" }],
    });
    await expect(assertClassMaterialScope(db, request)).resolves.toBeUndefined();
  });

  it("não assume identidade pelo nome nem por pessoa noutra escola", async () => {
    const { db } = makeDb({
      teachers: [{ ...teacher, user_id: null, person_id: "person-a" }],
      people: [{ id: "person-a", school_id: "school-b", user_id: "user-a", status: "active" }],
    });
    await expect(assertClassMaterialScope(db, request)).rejects.toThrow(
      /Sem atribuição docente activa/,
    );
  });

  it("mantém a coordenação institucional sem depender do cadastro docente", async () => {
    const { db, queries } = makeDb({}, "teachers");
    for (const role of ["Administrador", "Secretaria"]) {
      await expect(
        assertClassMaterialScope(db, { ...request, roles: ["Professor", role] }),
      ).resolves.toBeUndefined();
    }
    expect(queries).toHaveLength(0);
  });

  it("fecha o acesso se a consulta à atribuição falhar", async () => {
    const { db } = makeDb({}, "class_subjects");
    await expect(assertClassMaterialScope(db, request)).rejects.toThrow(
      /Não foi possível validar a turma/,
    );
  });
});
