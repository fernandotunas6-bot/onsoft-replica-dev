import { describe, it, expect, vi, beforeEach } from "vitest";
import { dividasImporter } from "@/features/import/importers/dividas-importer";
import { funcionariosImporter } from "@/features/import/importers/funcionarios-importer";
import { horariosImporter } from "@/features/import/importers/horarios-importer";
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

describe("Extra Importers (dividas, funcionarios, horarios)", () => {
  beforeEach(() => {
    resolveOrCreatePersonMock.mockReset();
  });

  describe("dividasImporter", () => {
    it("valida campos obrigatórios (aluno e montante)", () => {
      const cache = { students: [], existingInvoiceNumbers: new Set() };
      const analysis = dividasImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
      expect(analysis.errors).toContain("Valor em dívida deve ser um número positivo em Kwanzas.");
    });

    it("rejeita aluno inexistente", () => {
      const cache = { students: [], existingInvoiceNumbers: new Set() };
      const analysis = dividasImporter.analyzeRow(
        { student_identifier: "PROC-9999", amount_due: 35000 },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(`Aluno "PROC-9999" não encontrado no sistema escolar.`);
    });

    it("reconhece dívida válida", () => {
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
        existingInvoiceNumbers: new Set(),
      };
      const analysis = dividasImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          amount_due: 35000,
          invoice_number: "FT-2026-001",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("funcionariosImporter", () => {
    it("valida campos obrigatórios do funcionário", () => {
      const cache = { existingPeople: [], existingRoleKeys: new Set() };
      const analysis = funcionariosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Nome completo do funcionário é obrigatório.");
      expect(analysis.errors).toContain("Nº do Bilhete de Identidade é obrigatório.");
      expect(analysis.errors).toContain("Telefone de contacto é obrigatório.");
      expect(analysis.errors).toContain("Cargo ou função do funcionário é obrigatório.");
    });

    it("reconhece funcionário válido", () => {
      const cache = { existingPeople: [], existingRoleKeys: new Set() };
      const analysis = funcionariosImporter.analyzeRow(
        {
          full_name: "António Carlos dos Santos",
          id_number: "004567891HA021",
          phone: "912334455",
          role_title: "Técnico de Secretaria",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("commitRow cria a pessoa e associa o cargo (status imported)", async () => {
      const cache = { existingPeople: [] as any[], existingRoleKeys: new Set<string>() };
      const row = {
        full_name: "António Carlos dos Santos",
        id_number: "004567891HA021",
        phone: "912334455",
        role_title: "Técnico de Secretaria",
        email: "antonio.carlos@example.com",
      };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-2",
        created: true,
        match: null,
        audits: [{ table_name: "people", target_id: "person-2", action_type: "inserted" }],
      });
      const mockDb = createMockDb({ person_roles: { data: null, error: null } });
      const ctx = createMockCtx(mockDb);

      const result = await funcionariosImporter.commitRow(row, ctx, cache as any);

      expect(resolveOrCreatePersonMock).toHaveBeenCalledTimes(1);
      expect(resolveOrCreatePersonMock).toHaveBeenCalledWith(
        {
          full_name: "António Carlos dos Santos",
          national_id: "004567891HA021",
          phone: "912334455",
          email: "antonio.carlos@example.com",
        },
        cache.existingPeople,
        ctx,
      );
      expect(result.status).toBe("imported");
      expect(result.target_record_id).toBe("person-2:Técnico de Secretaria");
      expect(mockDb.from).toHaveBeenCalledWith("person_roles");
    });

    it("commitRow devolve duplicate sem gravar quando o cargo já existe", async () => {
      const cache = {
        existingPeople: [] as any[],
        existingRoleKeys: new Set<string>(["person-2:Técnico de Secretaria"]),
      };
      const row = {
        full_name: "António Carlos dos Santos",
        id_number: "004567891HA021",
        phone: "912334455",
        role_title: "Técnico de Secretaria",
      };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-2",
        created: false,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb();
      const ctx = createMockCtx(mockDb);

      const result = await funcionariosImporter.commitRow(row, ctx, cache as any);

      expect(result.status).toBe("duplicate");
      expect(result.target_record_id).toBe("person-2:Técnico de Secretaria");
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it("commitRow devolve error sem chamar resolveOrCreatePerson quando a linha é inválida", async () => {
      const cache = { existingPeople: [], existingRoleKeys: new Set() };
      const mockDb = createMockDb();
      const ctx = createMockCtx(mockDb);

      const result = await funcionariosImporter.commitRow({}, ctx, cache as any);

      expect(result.status).toBe("error");
      expect(resolveOrCreatePersonMock).not.toHaveBeenCalled();
    });

    it("commitRow devolve error quando a gravação do cargo falha", async () => {
      const cache = { existingPeople: [] as any[], existingRoleKeys: new Set<string>() };
      const row = {
        full_name: "António Carlos dos Santos",
        id_number: "004567891HA021",
        phone: "912334455",
        role_title: "Técnico de Secretaria",
      };
      resolveOrCreatePersonMock.mockResolvedValue({
        personId: "person-2",
        created: true,
        match: null,
        audits: [],
      });
      const mockDb = createMockDb({
        person_roles: { data: null, error: { message: "duplicate key" } },
      });
      const ctx = createMockCtx(mockDb);

      const result = await funcionariosImporter.commitRow(row, ctx, cache as any);

      expect(result.status).toBe("error");
      expect(result.errors[0]).toContain("duplicate key");
    });
  });

  describe("horariosImporter", () => {
    it("valida turma, disciplina, dia e horas", () => {
      const cache = { classGroups: [], subjects: [], existingSlots: new Set() };
      const analysis = horariosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Turma é obrigatória.");
      expect(analysis.errors).toContain("Disciplina é obrigatória.");
      expect(analysis.errors).toContain("Dia da semana inválido (ex: Segunda-feira, Terça-feira...).");
      expect(analysis.errors).toContain("Hora de início é obrigatória (ex: 07:30).");
      expect(analysis.errors).toContain("Hora de fim é obrigatória (ex: 08:15).");
    });

    it("reconhece horário válido", () => {
      const cache = {
        classGroups: [{ id: "g1", code: "10A-M", name: "10ª Classe A" }],
        subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
        existingSlots: new Set(),
      };
      const analysis = horariosImporter.analyzeRow(
        {
          class_group: "10A-M",
          subject: "MAT",
          weekday: "Segunda-feira",
          start_time: "07:30",
          end_time: "08:15",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });
});
