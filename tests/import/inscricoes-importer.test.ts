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
        is: vi.fn(() => query),
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

/** Cache com a forma real de `loadRefCache`: a lista de candidaturas e o conjunto dos números. */
function createCache(applications: Array<{ id: string; application_number: string | null; full_name: string }> = []) {
  return {
    existingPeople: [] as any[],
    classGroups: [],
    studentByPersonId: new Map(),
    applications,
    existingApplicantNumbers: new Set(
      applications.map((a) => a.application_number).filter((n): n is string => Boolean(n)),
    ),
  };
}

const APP_ROW = { id: "app-1", full_name: "Beatriz Fernandes", payload: {}, status: "pending" };

describe("inscricoesImporter", () => {
  beforeEach(() => {
    resolveOrCreatePersonMock.mockReset();
  });

  describe("analyzeRow", () => {
    it("exige nome completo do candidato", () => {
      const analysis = inscricoesImporter.analyzeRow({}, createCache() as any);
      expect(analysis.status).toBe("error");
    });

    it("aceita um número de candidatura ainda não usado", () => {
      const analysis = inscricoesImporter.analyzeRow(
        { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" },
        createCache() as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("marca número de candidatura existente como duplicado da candidatura real", () => {
      const cache = createCache([
        { id: "app-existente", application_number: "CAND-2026-010", full_name: "Beatriz Fernandes" },
      ]);
      const analysis = inscricoesImporter.analyzeRow(
        { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" },
        cache as any,
      );
      expect(analysis.status).toBe("duplicate");
      expect(analysis.duplicate_of).toBe("app-existente");
    });
  });

  describe("commitRow", () => {
    it("cria a pessoa e a candidatura (status imported)", async () => {
      const cache = createCache();
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
      const mockDb = createMockDb({ enrollment_applications: { data: APP_ROW, error: null } });
      const ctx = createMockCtx(mockDb);

      const result = await inscricoesImporter.commitRow(row, ctx, cache as any);

      expect(resolveOrCreatePersonMock).toHaveBeenCalledTimes(1);
      expect(resolveOrCreatePersonMock).toHaveBeenCalledWith(candidate, cache.existingPeople, ctx);
      expect(result.status).toBe("imported");
      expect(result.target_record_id).toBe("app-1");
      expect(mockDb.from).toHaveBeenCalledWith("enrollment_applications");
      expect(cache.existingApplicantNumbers.has("CAND-2026-010")).toBe(true);
    });

    // A ordem importa: antes, a pessoa era criada e só depois a candidatura falhava
    // na chave única, deixando uma pessoa órfã por cada linha repetida.
    it("não cria pessoa nem toca na base quando o número já existe e a estratégia é ignorar", async () => {
      const cache = createCache([
        { id: "app-existente", application_number: "CAND-2026-010", full_name: "Beatriz Fernandes" },
      ]);
      const mockDb = createMockDb();

      const result = await inscricoesImporter.commitRow(
        { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" },
        createMockCtx(mockDb, { duplicateStrategy: "ignore" }),
        cache as any,
      );

      expect(result.status).toBe("ignored");
      expect(result.target_record_id).toBe("app-existente");
      expect(resolveOrCreatePersonMock).not.toHaveBeenCalled();
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it("recusa criar uma segunda candidatura com o mesmo número, sem criar pessoa", async () => {
      const cache = createCache([
        { id: "app-existente", application_number: "CAND-2026-010", full_name: "Beatriz Fernandes" },
      ]);
      const mockDb = createMockDb();

      const result = await inscricoesImporter.commitRow(
        { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" },
        createMockCtx(mockDb, { duplicateStrategy: "create_new" }),
        cache as any,
      );

      expect(result.status).toBe("error");
      expect(resolveOrCreatePersonMock).not.toHaveBeenCalled();
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it("gera um número de candidatura quando nenhum é fornecido", async () => {
      const cache = createCache();
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-3",
        created: true,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb({ enrollment_applications: { data: APP_ROW, error: null } });

      const result = await inscricoesImporter.commitRow(
        { full_name: "Beatriz Fernandes" },
        createMockCtx(mockDb),
        cache as any,
      );

      expect(result.status).toBe("imported");
      expect(cache.existingApplicantNumbers.size).toBe(1);
    });

    // O número não pode depender do milissegundo: várias linhas são processadas no mesmo instante.
    it("gera candidaturas distintas no mesmo lote quando o número não é fornecido", async () => {
      const cache = createCache();
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-3",
        created: true,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb({ enrollment_applications: { data: APP_ROW, error: null } });
      const ctx = createMockCtx(mockDb);

      await inscricoesImporter.commitRow({ full_name: "Beatriz Fernandes" }, ctx, cache as any);
      await inscricoesImporter.commitRow({ full_name: "Joana Fernandes" }, ctx, cache as any);

      expect(cache.existingApplicantNumbers.size).toBe(2);
    });

    it("devolve error sem chamar resolveOrCreatePerson quando a linha é inválida", async () => {
      const mockDb = createMockDb();

      const result = await inscricoesImporter.commitRow({}, createMockCtx(mockDb), createCache() as any);

      expect(result.status).toBe("error");
      expect(resolveOrCreatePersonMock).not.toHaveBeenCalled();
    });

    it("devolve error quando a gravação da candidatura falha, sem marcar o número como usado", async () => {
      const cache = createCache();
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-3",
        created: true,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb({
        enrollment_applications: { data: null, error: { message: "número de candidatura duplicado" } },
      });

      const result = await inscricoesImporter.commitRow(
        { full_name: "Beatriz Fernandes", application_number: "CAND-2026-010" },
        createMockCtx(mockDb),
        cache as any,
      );

      expect(result.status).toBe("error");
      expect(result.errors[0]).toContain("número de candidatura duplicado");
      expect(cache.existingApplicantNumbers.size).toBe(0);
    });
  });
});
