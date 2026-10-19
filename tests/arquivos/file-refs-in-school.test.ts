import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertFileRefsInSchool } from "@/features/arquivos/server";

/**
 * Auditoria 13: um ficheiro não pode ficar ligado a uma pasta, turma, pessoa ou
 * conta de outra escola. A base não o impede (chaves estrangeiras só pelo id).
 */
const SCHOOL = "school-a";
type Row = Record<string, unknown> & { school_id: string };
const tables: Record<string, Row[]> = {
  siga_files: [
    { id: "pasta-a", school_id: SCHOOL, is_folder: true, deleted_at: null },
    { id: "ficheiro-a", school_id: SCHOOL, is_folder: false, deleted_at: null },
    { id: "pasta-b", school_id: "school-b", is_folder: true, deleted_at: null },
  ],
  class_groups: [
    { id: "turma-a", school_id: SCHOOL },
    { id: "turma-b", school_id: "school-b" },
  ],
  people: [
    { id: "pessoa-a", school_id: SCHOOL },
    { id: "pessoa-b", school_id: "school-b" },
  ],
  school_memberships: [
    { id: "m1", user_id: "conta-a", school_id: SCHOOL },
    { id: "m2", user_id: "conta-b", school_id: "school-b" },
  ],
};

function fakeDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value);
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => ({
          data: (tables[table] ?? []).find((row) => filters.every((f) => f(row))) ?? null,
          error: null,
        }),
      };
      return chain;
    },
  } as never;
}

describe("referências de um ficheiro", () => {
  it("aceita pasta, turma, pessoa e conta da própria escola", async () => {
    await expect(
      assertFileRefsInSchool(fakeDb(), SCHOOL, {
        parentId: "pasta-a",
        classGroupId: "turma-a",
        relatedPersonId: "pessoa-a",
        relatedUserId: "conta-a",
      }),
    ).resolves.toBeUndefined();
    await expect(assertFileRefsInSchool(fakeDb(), SCHOOL, {})).resolves.toBeUndefined();
  });

  it("recusa cada referência de outra escola", async () => {
    await expect(assertFileRefsInSchool(fakeDb(), SCHOOL, { parentId: "pasta-b" })).rejects.toThrow(
      /pasta/,
    );
    await expect(
      assertFileRefsInSchool(fakeDb(), SCHOOL, { classGroupId: "turma-b" }),
    ).rejects.toThrow(/turma/);
    await expect(
      assertFileRefsInSchool(fakeDb(), SCHOOL, { relatedPersonId: "pessoa-b" }),
    ).rejects.toThrow(/pessoa/);
    await expect(
      assertFileRefsInSchool(fakeDb(), SCHOOL, { relatedUserId: "conta-b" }),
    ).rejects.toThrow(/conta/);
  });

  it("a pasta-mãe tem de ser uma pasta", async () => {
    await expect(
      assertFileRefsInSchool(fakeDb(), SCHOOL, { parentId: "ficheiro-a" }),
    ).rejects.toThrow(/pasta/);
  });

  it("as funções que gravam estas referências verificam-nas", () => {
    const source = readFileSync("src/features/arquivos/server.ts", "utf8");
    for (const name of [
      "registerSchoolFile",
      "createSchoolFolder",
      "linkSchoolFileToClass",
      "updateSchoolFileMeta",
    ]) {
      const start = source.indexOf(`export const ${name}`);
      const body = source.slice(start, source.indexOf("export const", start + 1));
      expect(body, name).toContain("assertFileRefsInSchool(db, membership.schoolId");
    }
  });
});
