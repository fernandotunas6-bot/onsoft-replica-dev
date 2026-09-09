import { describe, it, expect, vi, beforeEach } from "vitest";
import { inscricoesImporter } from "@/features/import/importers/inscricoes-importer";
import { personCandidateFromRow, resolveOrCreatePerson } from "@/features/import/importers/people-core";
import type { ImportCommitContext } from "@/features/import/engine/types";

vi.mock("@/features/import/importers/people-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/import/importers/people-core")>();
  return { ...actual, resolveOrCreatePerson: vi.fn() };
});

const resolveOrCreatePersonMock = vi.mocked(resolveOrCreatePerson);

function createMockDb(responses: Record<string, { data?: any; error?: any }> = {}) {
  return {
    from: vi.fn((table: string) => {
      const result = responses[table] ?? { data: null, error: null };
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        insert: vi.fn(() => query),
        update: vi.fn(() => query),
        upsert: vi.fn(() => query),
        single: vi.fn(() => Promise.resolve(result)),
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    }),
  };
}

function createMockCtx(db: any, overrides: Partial<ImportCommitContext> = {}): ImportCommitContext {
  return {
    db,
    sessionSupabase: db,
    schoolId: "school-1",
    academicYearId: null,
    userId: "user-1",
    duplicateStrategy: "update",
    dryRun: false,
    ...overrides,
  };
}

describe("inscricoesImporter", () => {
  beforeEach(() => {
    resolveOrCreatePersonMock.mockReset();
  });

  describe("analyzeRow", () => {
    it("exige nome completo do candidato", () => {
      const cache = { existingPeople: [], classGroups: [], studentByPersonId: new Map(), existingApplicantNumbers: new Set() };
      const analysis = inscricoesImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Nome completo do candidato é obrigatório.");
    });

    it("reconhece candidatura válida", () => {
      const cache = { existingPeople: [], classGroups: [], studentByPersonId: new Map(), existingApplicantNumbers: new Set() };
      const analysis = inscricoesImporter.analyzeRow(
        { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("avisa quando o número de candidatura já existe", () => {
      const cache = {
        existingPeople: [],
        classGroups: [],
        studentByPersonId: new Map(),
        existingApplicantNumbers: new Set(["CAND-2026-010"]),
      };
      const analysis = inscricoesImporter.analyzeRow(
        { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
      expect(analysis.warnings).toContain(
        `Candidatura "CAND-2026-010" já existe no sistema; dados serão consolidados.`,
      );
    });
  });

  describe("commitRow", () => {
    it("cria a pessoa e a candidatura (status imported)", async () => {
      const cache = {
        existingPeople: [] as any[],
        classGroups: [],
        studentByPersonId: new Map(),
        existingApplicantNumbers: new Set<string>(),
      };
      const row = {
        full_name: "Beatriz Fernandes",
        national_id: "003456789LA077",
        phone: "927001122",
        email: "beatriz@example.com",
        application_number: "CAND-2026-010",
      };
      const candidate = personCandidateFromRow(row)!;
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-3",
        created: true,
        match: null,
        audits: [{ table_name: "people", target_id: "person-3", action_type: "inserted" }],
      });
      const mockDb = createMockDb({ students: { data: { id: "student-1" }, error: null } });
      const ctx = createMockCtx(mockDb);

      const result = await inscricoesImporter.commitRow(row, ctx, cache as any);

      expect(resolveOrCreatePersonMock).toHaveBeenCalledTimes(1);
      expect(resolveOrCreatePersonMock).toHaveBeenCalledWith(candidate, cache.existingPeople, ctx);
      expect(result.status).toBe("imported");
      expect(result.target_record_id).toBe("student-1");
      expect(result.audits).toEqual([
        { table_name: "people", target_id: "person-3", action_type: "inserted" },
      ]);
      expect(mockDb.from).toHaveBeenCalledWith("students");
      expect(cache.existingApplicantNumbers.has("CAND-2026-010")).toBe(true);
    });

    it("gera um número de candidatura quando nenhum é fornecido", async () => {
      const cache = {
        existingPeople: [] as any[],
        classGroups: [],
        studentByPersonId: new Map(),
        existingApplicantNumbers: new Set<string>(),
      };
      const row = { full_name: "Beatriz Fernandes" };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-3",
        created: true,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb({ students: { data: { id: "student-1" }, error: null } });
      const ctx = createMockCtx(mockDb);

      const result = await inscricoesImporter.commitRow(row, ctx, cache as any);

      expect(result.status).toBe("imported");
      expect(cache.existingApplicantNumbers.size).toBe(1);
    });

    it("devolve error sem chamar resolveOrCreatePerson quando a linha é inválida", async () => {
      const cache = {
        existingPeople: [],
        classGroups: [],
        studentByPersonId: new Map(),
        existingApplicantNumbers: new Set(),
      };
      const mockDb = createMockDb();
      const ctx = createMockCtx(mockDb);

      const result = await inscricoesImporter.commitRow({}, ctx, cache as any);

      expect(result.status).toBe("error");
      expect(resolveOrCreatePersonMock).not.toHaveBeenCalled();
    });

    it("devolve error quando a gravação da candidatura falha", async () => {
      const cache = {
        existingPeople: [] as any[],
        classGroups: [],
        studentByPersonId: new Map(),
        existingApplicantNumbers: new Set<string>(),
      };
      const row = { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-3",
        created: true,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb({
        students: { data: null, error: { message: "número de aluno duplicado" } },
      });
      const ctx = createMockCtx(mockDb);

      const result = await inscricoesImporter.commitRow(row, ctx, cache as any);

      expect(result.status).toBe("error");
      expect(result.errors[0]).toContain("número de aluno duplicado");
      expect(cache.existingApplicantNumbers.size).toBe(0);
    });
  });
});
