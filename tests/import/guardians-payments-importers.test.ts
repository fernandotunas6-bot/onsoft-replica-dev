import { describe, it, expect, vi, beforeEach } from "vitest";
import { encarregadosImporter } from "@/features/import/importers/encarregados-importer";
import { pagamentosImporter } from "@/features/import/importers/pagamentos-importer";
import { resolveOrCreatePerson } from "@/features/import/importers/people-core";
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

describe("Guardians & Payments Importers", () => {
  beforeEach(() => {
    resolveOrCreatePersonMock.mockReset();
  });

  describe("encarregadosImporter", () => {
    it("valida campos obrigatórios (aluno, nome, telefone)", () => {
      const cache = { students: [], existingPeople: [], existingGuardians: new Set() };
      const analysis = encarregadosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
      expect(analysis.errors).toContain("Nome do encarregado é obrigatório.");
      expect(analysis.errors).toContain("Telefone do encarregado é obrigatório.");
    });

    it("rejeita aluno inexistente", () => {
      const cache = { students: [], existingPeople: [], existingGuardians: new Set() };
      const analysis = encarregadosImporter.analyzeRow(
        {
          student_identifier: "PROC-9999",
          guardian_name: "Manuel Sebastião",
          phone: "924556677",
        },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(`Aluno "PROC-9999" não encontrado no sistema.`);
    });

    it("reconhece encarregado válido quando aluno existe", () => {
      const cache = {
        students: [
          {
            id: "s1",
            person_id: "p1",
            student_number: "PROC-2026-042",
            national_id: "005432190LA048",
            status: "active",
          },
        ],
        existingPeople: [],
        existingGuardians: new Set(),
      };
      const analysis = encarregadosImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          guardian_name: "Manuel Sebastião",
          phone: "924556677",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("commitRow cria a pessoa e associa o encarregado ao aluno (status imported)", async () => {
      const cache = {
        students: [
          {
            id: "s1",
            person_id: "p1",
            student_number: "PROC-2026-042",
            national_id: "005432190LA048",
            status: "active",
          },
        ],
        existingPeople: [] as any[],
        existingGuardians: new Set<string>(),
      };
      const row = {
        student_identifier: "PROC-2026-042",
        guardian_name: "Manuel Sebastião",
        phone: "924556677",
        id_number: "005678123LA019",
        email: "manuel.sebastiao@example.com",
        relationship_type: "Pai",
        is_financial_responsible: "Sim",
      };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-1",
        created: true,
        match: null,
        audits: [{ table_name: "people", target_id: "person-1", action_type: "inserted" }],
      });
      const mockDb = createMockDb({ student_guardians: { data: null, error: null } });
      const ctx = createMockCtx(mockDb);

      const result = await encarregadosImporter.commitRow(row, ctx, cache as any);

      expect(resolveOrCreatePersonMock).toHaveBeenCalledTimes(1);
      expect(resolveOrCreatePersonMock).toHaveBeenCalledWith(
        {
          full_name: "Manuel Sebastião",
          national_id: "005678123LA019",
          phone: "924556677",
          email: "manuel.sebastiao@example.com",
        },
        cache.existingPeople,
        ctx,
      );
      expect(result.status).toBe("imported");
      expect(result.target_record_id).toBe("s1:person-1");
      expect(result.audits).toEqual([
        { table_name: "people", target_id: "person-1", action_type: "inserted" },
      ]);
      expect(mockDb.from).toHaveBeenCalledWith("student_guardians");
    });

    it("commitRow devolve duplicate sem gravar quando a relação já existe", async () => {
      const cache = {
        students: [
          {
            id: "s1",
            person_id: "p1",
            student_number: "PROC-2026-042",
            national_id: "005432190LA048",
            status: "active",
          },
        ],
        existingPeople: [] as any[],
        existingGuardians: new Set<string>(["s1:person-1"]),
      };
      const row = {
        student_identifier: "PROC-2026-042",
        guardian_name: "Manuel Sebastião",
        phone: "924556677",
      };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-1",
        created: false,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb();
      const ctx = createMockCtx(mockDb);

      const result = await encarregadosImporter.commitRow(row, ctx, cache as any);

      expect(result.status).toBe("duplicate");
      expect(result.target_record_id).toBe("s1:person-1");
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it("commitRow devolve error sem chamar resolveOrCreatePerson quando a linha é inválida", async () => {
      const cache = { students: [], existingPeople: [], existingGuardians: new Set() };
      const mockDb = createMockDb();
      const ctx = createMockCtx(mockDb);

      const result = await encarregadosImporter.commitRow({}, ctx, cache as any);

      expect(result.status).toBe("error");
      expect(resolveOrCreatePersonMock).not.toHaveBeenCalled();
    });

    it("commitRow devolve error quando a gravação da relação falha", async () => {
      const cache = {
        students: [
          {
            id: "s1",
            person_id: "p1",
            student_number: "PROC-2026-042",
            national_id: "005432190LA048",
            status: "active",
          },
        ],
        existingPeople: [] as any[],
        existingGuardians: new Set<string>(),
      };
      const row = {
        student_identifier: "PROC-2026-042",
        guardian_name: "Manuel Sebastião",
        phone: "924556677",
      };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-1",
        created: true,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb({
        student_guardians: { data: null, error: { message: "constraint violation" } },
      });
      const ctx = createMockCtx(mockDb);

      const result = await encarregadosImporter.commitRow(row, ctx, cache as any);

      expect(result.status).toBe("error");
      expect(result.errors[0]).toContain("constraint violation");
    });
  });

  describe("pagamentosImporter", () => {
    it("valida aluno e montante positivo", () => {
      const cache = { students: [], existingReceipts: new Set() };
      const analysis = pagamentosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
      expect(analysis.errors).toContain("Valor do pagamento deve ser um número positivo em Kwanzas.");
    });

    it("reconhece pagamento válido para aluno existente", () => {
      const cache = {
        students: [
          {
            id: "s1",
            person_id: "p1",
            student_number: "PROC-2026-042",
            national_id: "005432190LA048",
            status: "active",
          },
        ],
        existingReceipts: new Set(),
      };
      const analysis = pagamentosImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          amount: 35000,
          payment_method: "Multicaixa",
          receipt_number: "REC-12345",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("detecta recibo duplicado", () => {
      const cache = {
        students: [
          {
            id: "s1",
            person_id: "p1",
            student_number: "PROC-2026-042",
            national_id: "005432190LA048",
            status: "active",
          },
        ],
        existingReceipts: new Set(["REC-12345"]),
      };
      const analysis = pagamentosImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          amount: 35000,
          receipt_number: "REC-12345",
        },
        cache as any,
      );
      expect(analysis.status).toBe("duplicate");
      expect(analysis.duplicate_of).toBe("REC-12345");
    });
  });
});
