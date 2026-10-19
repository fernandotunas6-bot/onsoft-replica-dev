import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { selectAllPages } from "@/features/import/engine/paged";
import { alunosImporter } from "@/features/import/importers/alunos-importer";

/**
 * Auditoria 13: os importadores liam alunos e pessoas num só pedido. O PostgREST
 * corta em 1000 linhas sem erro (e a leitura de pessoas tinha um tecto de 2000),
 * e numa escola maior os registos existentes deixavam de ser reconhecidos.
 */
describe("selectAllPages", () => {
  it("junta as páginas até uma vir incompleta", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const calls: Array<[number, number]> = [];
    const rows = await selectAllPages<{ id: number }>(
      async (from, to) => {
        calls.push([from, to]);
        return { data: all.slice(from, to + 1), error: null };
      },
      "falhou",
      1000,
    );
    expect(rows).toHaveLength(2500);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("lança com o prefixo quando uma página falha", async () => {
    await expect(
      selectAllPages(async () => ({ data: null, error: { message: "boom" } }), "Sem alunos"),
    ).rejects.toThrow("Sem alunos: boom");
  });

  it("nenhum importador volta a ler pessoas com tecto fixo ou ids num .in gigante", () => {
    const people = readFileSync("src/features/import/importers/people-core.ts", "utf8");
    expect(people).not.toMatch(/\.limit\(2000\)/);
    expect(people).toContain("selectAllPages");
    const academic = readFileSync("src/features/import/importers/academic-core.ts", "utf8");
    const loader = academic.slice(academic.indexOf("export async function loadStudentRefs"));
    expect(loader.slice(0, loader.indexOf("\n}\n"))).not.toContain('.in("id"');
  });
});

describe("importação de alunos e o limite do plano", () => {
  const ctx = (assertCanAddStudent: () => Promise<void>) => ({
    db: {} as never,
    sessionSupabase: {} as never,
    schoolId: "school-1",
    academicYearId: null,
    userId: "user-1",
    duplicateStrategy: "update" as const,
    dryRun: false,
    assertCanAddStudent,
  });

  it("recusa a linha antes de criar a pessoa quando a escola está no limite", async () => {
    const assertCanAddStudent = vi.fn(async () => {
      throw new Error("Limite de 50 alunos do plano atingido.");
    });
    const result = await alunosImporter.commitRow(
      { full_name: "Ana Maria Domingos" },
      ctx(assertCanAddStudent),
      { existingPeople: [], classGroups: [], studentByPersonId: new Map() },
    );
    expect(assertCanAddStudent).toHaveBeenCalledOnce();
    expect(result.status).toBe("error");
    expect(result.errors.join(" ")).toContain("Limite de 50 alunos");
    expect(result.audits).toEqual([]);
  });

  it("um aluno que já existe não conta para o limite", async () => {
    const assertCanAddStudent = vi.fn(async () => {
      throw new Error("não devia ser chamado");
    });
    const person = {
      id: "p1",
      full_name: "Ana Maria Domingos",
      email: null,
      phone: null,
      national_id: "005432190LA048",
      date_of_birth: null,
      status: "active",
    };
    const result = await alunosImporter.commitRow(
      { full_name: "Ana Maria Domingos", bi: "005432190LA048" },
      { ...ctx(assertCanAddStudent), duplicateStrategy: "ignore" },
      {
        existingPeople: [person],
        classGroups: [],
        studentByPersonId: new Map([["p1", { id: "s1", student_number: "PROC-1" }]]),
      },
    );
    expect(assertCanAddStudent).not.toHaveBeenCalled();
    expect(result.status).not.toBe("error");
  });
});
