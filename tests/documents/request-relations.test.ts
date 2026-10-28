import { describe, expect, it } from "vitest";
import { requireDocumentRequestRelations } from "@/features/documents/request-relations";
import { memoryDb } from "../students/memory-db";

const SCHOOL = "escola-a";
const STUDENT = "aluno-a";
const TEMPLATE = "modelo-a";

function fixture(input?: {
  studentSchool?: string;
  templateSchool?: string;
  templateStatus?: string;
}) {
  const store = memoryDb({
    students: [{ id: STUDENT, school_id: input?.studentSchool ?? SCHOOL }],
    document_templates: [
      {
        id: TEMPLATE,
        school_id: input?.templateSchool ?? SCHOOL,
        name: "Declaração",
        document_type: "declaration",
        status: input?.templateStatus ?? "active",
      },
    ],
    document_requests: [],
  });
  const guard = () =>
    requireDocumentRequestRelations(store.db, {
      schoolId: SCHOOL,
      studentId: STUDENT,
      templateId: TEMPLATE,
    });
  return { ...store, guard };
}

describe("pedido de documento — isolamento escola/modelo/aluno", () => {
  it("aceita aluno e modelo activos da mesma escola, sem gravar nada", async () => {
    const store = fixture();
    await expect(store.guard()).resolves.toMatchObject({
      id: TEMPLATE,
      name: "Declaração",
      document_type: "declaration",
    });
    expect(store.writes).toEqual([]);
  });

  it("não aceita aluno de outra escola mesmo com modelo local", async () => {
    const store = fixture({ studentSchool: "escola-b" });
    await expect(store.guard()).rejects.toThrow("Aluno não encontrado nesta escola");
    expect(store.writes).toEqual([]);
  });

  it("não aceita modelo de outra escola mesmo com aluno local", async () => {
    const store = fixture({ templateSchool: "escola-b" });
    await expect(store.guard()).rejects.toThrow(/Modelo de documento activo não encontrado/);
    expect(store.writes).toEqual([]);
  });

  it("não permite criar pedido com modelo inactivo", async () => {
    const store = fixture({ templateStatus: "inactive" });
    await expect(store.guard()).rejects.toThrow(/Modelo de documento activo não encontrado/);
    expect(store.writes).toEqual([]);
  });

  it("falha fechado quando a leitura do aluno está indisponível", async () => {
    const db = {
      from(table: string) {
        if (table === "students") {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data: null,
              error: { code: "57014", message: "statement timeout" },
            }),
          };
          return query;
        }
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: { id: TEMPLATE, name: "Declaração", document_type: "declaration" },
            error: null,
          }),
        };
        return query;
      },
    };
    await expect(
      requireDocumentRequestRelations(db as never, {
        schoolId: SCHOOL,
        studentId: STUDENT,
        templateId: TEMPLATE,
      }),
    ).rejects.toThrow();
  });
});
