import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_ROLES,
  DEFAULT_DOCUMENT_SEQUENCES,
  SECRETARY_PERMISSION_CODES,
  TREASURY_PERMISSION_CODES,
  TEACHER_PERMISSION_CODES,
  GUARDIAN_PERMISSION_CODES,
  STUDENT_PERMISSION_CODES,
  USER_PERMISSION_CODES,
  seedDefaultRolePermissions,
  seedDefaultDocumentSequences,
  bootstrapSchoolDefaults,
} from "@/features/saas/school-bootstrap";

// Mock das dependências académicas para isolar o teste do módulo SaaS bootstrap
vi.mock("@/features/academic/academic-bootstrap", () => ({
  bootstrapAcademicYearIfMissing: vi.fn().mockResolvedValue({ seeded: ["ano lectivo 2026/2027"] }),
  bootstrapAcademicStructure: vi.fn().mockResolvedValue({ seeded: ["disciplinas base", "ciclos"] }),
}));

import {
  bootstrapAcademicYearIfMissing,
  bootstrapAcademicStructure,
} from "@/features/academic/academic-bootstrap";

type MockDbConfig = {
  roles?: { id: string; code: string }[];
  existingRolesCodes?: string[];
  permissions?: { id: string; code: string }[];
  activeAcademicYear?: { id: string } | null;
  existingFeePlan?: { id: string } | null;
  existingEnrollmentForm?: { id: string } | null;
  existingSchoolSettings?: { school_id: string } | null;
  tableErrors?: Record<string, { code: string; message: string }>;
};

function createMockSupabase(config: MockDbConfig = {}) {
  const upsertCalls: Record<string, any[]> = {};
  const insertCalls: Record<string, any[]> = {};
  const selectCalls: Record<string, any[]> = {};

  const client = {
    _upsertCalls: upsertCalls,
    _insertCalls: insertCalls,
    _selectCalls: selectCalls,
    from: vi.fn((tableName: string) => {
      const tableError = config.tableErrors?.[tableName] ?? null;

      const builder: any = {
        _table: tableName,
        select: vi.fn((columns?: string) => {
          builder._lastSelect = columns;
          selectCalls[tableName] = selectCalls[tableName] || [];
          selectCalls[tableName].push(columns);
          return builder;
        }),
        eq: vi.fn((column: string, value: any) => {
          builder._lastEq = { column, value };
          return builder;
        }),
        is: vi.fn((column: string, value: any) => {
          builder._lastIs = { column, value };
          return builder;
        }),
        limit: vi.fn((_n: number) => builder),
        order: vi.fn(() => builder),
        single: vi.fn(async () => {
          if (tableError) return { data: null, error: tableError };
          if (tableName === "fee_plans") {
            return { data: { id: "plan-new-id" }, error: null };
          }
          return { data: null, error: null };
        }),
        maybeSingle: vi.fn(async () => {
          if (tableError) return { data: null, error: tableError };

          if (tableName === "academic_years") {
            const year =
              config.activeAcademicYear !== undefined
                ? config.activeAcademicYear
                : { id: "year-123" };
            return { data: year, error: null };
          }
          if (tableName === "fee_plans") {
            return { data: config.existingFeePlan ?? null, error: null };
          }
          if (tableName === "enrollment_forms") {
            return { data: config.existingEnrollmentForm ?? null, error: null };
          }
          if (tableName === "school_settings") {
            return { data: config.existingSchoolSettings ?? null, error: null };
          }
          return { data: null, error: null };
        }),
        insert: vi.fn((payload: any) => {
          insertCalls[tableName] = insertCalls[tableName] || [];
          insertCalls[tableName].push(payload);

          const insertBuilder: any = {
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                if (tableError) return { data: null, error: tableError };
                return { data: { id: `${tableName}-new-id` }, error: null };
              }),
            })),
            then: (resolve: any) => {
              if (tableError) return resolve({ error: tableError });
              return resolve({ error: null });
            },
          };
          return insertBuilder;
        }),
        upsert: vi.fn(async (payload: any, options: any) => {
          upsertCalls[tableName] = upsertCalls[tableName] || [];
          upsertCalls[tableName].push({ payload, options });
          if (tableError) return { error: tableError };
          return { error: null };
        }),
        // When queried as a promise (e.g. await db.from("roles").select(...))
        then: (resolve: any) => {
          if (tableError) return resolve({ data: null, error: tableError });

          if (tableName === "roles") {
            if (builder._lastSelect === "code" && config.existingRolesCodes !== undefined) {
              return resolve({
                data: config.existingRolesCodes.map((code) => ({ code })),
                error: null,
              });
            }
            return resolve({
              data: config.roles ?? [
                { id: "role-owner", code: "owner" },
                { id: "role-admin", code: "admin" },
                { id: "role-secretary", code: "secretary" },
                { id: "role-treasury", code: "treasury" },
                { id: "role-teacher", code: "teacher" },
                { id: "role-guardian", code: "guardian" },
                { id: "role-student", code: "student" },
                { id: "role-user", code: "user" },
              ],
              error: null,
            });
          }

          if (tableName === "permissions") {
            return resolve({
              data:
                config.permissions ??
                [
                  ...SECRETARY_PERMISSION_CODES,
                  ...TREASURY_PERMISSION_CODES,
                  ...TEACHER_PERMISSION_CODES,
                  ...GUARDIAN_PERMISSION_CODES,
                  ...STUDENT_PERMISSION_CODES,
                  ...USER_PERMISSION_CODES,
                  "extra.special.perm",
                ].map((code, idx) => ({ id: `perm-${idx + 1}`, code })),
              error: null,
            });
          }

          return resolve({ data: [], error: null });
        },
      };

      return builder;
    }),
  };

  return client;
}

describe("school-bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Canonical Constants & Permissions Lists", () => {
    it("valida a lista de papéis canónicos (8 papéis essenciais)", () => {
      expect(DEFAULT_ROLES).toHaveLength(8);
      const codes = DEFAULT_ROLES.map((r) => r.code);
      expect(codes).toEqual([
        "owner",
        "admin",
        "secretary",
        "treasury",
        "teacher",
        "student",
        "guardian",
        "user",
      ]);
      for (const role of DEFAULT_ROLES) {
        expect(role.is_system).toBe(false);
        expect(role.name).toBeTruthy();
      }
    });

    it("valida sequências de documentos canónicas (9 tipos)", () => {
      expect(DEFAULT_DOCUMENT_SEQUENCES).toHaveLength(9);
      const types = DEFAULT_DOCUMENT_SEQUENCES.map((d) => d.document_type);
      expect(types).toEqual([
        "invoice",
        "receipt",
        "credit_note",
        "expense",
        "declaration",
        "certificate",
        "transfer",
        "term",
        "other",
      ]);

      const invoiceSeq = DEFAULT_DOCUMENT_SEQUENCES.find((d) => d.document_type === "invoice");
      expect(invoiceSeq).toEqual({
        document_type: "invoice",
        prefix: "FT",
        next_number: 1,
        padding: 4,
      });

      const receiptSeq = DEFAULT_DOCUMENT_SEQUENCES.find((d) => d.document_type === "receipt");
      expect(receiptSeq).toEqual({
        document_type: "receipt",
        prefix: "RC",
        next_number: 1,
        padding: 6,
      });
    });

    it("assegura que listas de permissões por papel não contêm duplicados e cobrem operações críticas", () => {
      const secretarySet = new Set(SECRETARY_PERMISSION_CODES);
      expect(secretarySet.size).toBe(SECRETARY_PERMISSION_CODES.length);
      expect(secretarySet.has("students.records.create")).toBe(true);
      expect(secretarySet.has("academic.classes.manage")).toBe(true);
      expect(secretarySet.has("documents.batch.issue")).toBe(true);

      const treasurySet = new Set(TREASURY_PERMISSION_CODES);
      expect(treasurySet.size).toBe(TREASURY_PERMISSION_CODES.length);
      expect(treasurySet.has("finance.payments.create")).toBe(true);
      expect(treasurySet.has("finance.invoices.read")).toBe(true);
      expect(treasurySet.has("finance.settings.manage")).toBe(true);

      const teacherSet = new Set(TEACHER_PERMISSION_CODES);
      expect(teacherSet.size).toBe(TEACHER_PERMISSION_CODES.length);
      expect(teacherSet.has("attendance.records.take")).toBe(true);
      expect(teacherSet.has("assessment.grades.manage")).toBe(true);
      expect(teacherSet.has("assessment.grades.submit")).toBe(true);

      const guardianSet = new Set(GUARDIAN_PERMISSION_CODES);
      expect(guardianSet.size).toBe(GUARDIAN_PERMISSION_CODES.length);
      expect(guardianSet.has("attendance.records.read")).toBe(true);
      expect(guardianSet.has("finance.invoices.read")).toBe(true);
      expect(
        guardianSet.has("documents.requests.create" as any) ||
          guardianSet.has("documents.requests.manage"),
      ).toBe(true);

      const studentSet = new Set(STUDENT_PERMISSION_CODES);
      expect(studentSet.size).toBe(STUDENT_PERMISSION_CODES.length);
      expect(studentSet.has("assessment.grades.read")).toBe(true);
      expect(studentSet.has("academic.timetable.read")).toBe(true);

      const userSet = new Set(USER_PERMISSION_CODES);
      expect(userSet.size).toBe(USER_PERMISSION_CODES.length);
      expect(userSet.has("communication.inbox.read")).toBe(true);
      expect(userSet.has("communication.announcements.read")).toBe(true);
    });
  });

  describe("seedDefaultDocumentSequences", () => {
    it("faz upsert de todas as 9 sequências de documentos com o school_id correcto", async () => {
      const db = createMockSupabase();
      await seedDefaultDocumentSequences(db as any, "school-abc");

      expect(db._upsertCalls.document_sequences).toHaveLength(1);
      const call = db._upsertCalls.document_sequences[0];
      expect(call.options).toEqual({
        onConflict: "school_id,document_type",
        ignoreDuplicates: true,
      });
      expect(call.payload).toHaveLength(9);
      for (const row of call.payload) {
        expect(row.school_id).toBe("school-abc");
        expect(typeof row.prefix).toBe("string");
        expect(row.next_number).toBe(1);
        expect(row.padding).toBeGreaterThanOrEqual(4);
      }
    });

    it("lida silenciosamente quando a tabela document_sequences não existe (42P01)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const db = createMockSupabase({
        tableErrors: {
          document_sequences: {
            code: "42P01",
            message: "relation document_sequences does not exist",
          },
        },
      });

      await expect(seedDefaultDocumentSequences(db as any, "school-xyz")).resolves.not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("avisa na consola se ocorrer outro erro genérico de BD", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const db = createMockSupabase({
        tableErrors: {
          document_sequences: { code: "23505", message: "unique constraint violation" },
        },
      });

      await expect(seedDefaultDocumentSequences(db as any, "school-xyz")).resolves.not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        "[seedDefaultDocumentSequences] document_sequences:",
        "unique constraint violation",
      );
      warnSpy.mockRestore();
    });
  });

  describe("seedDefaultRolePermissions", () => {
    it("atribui permissões adequadas a cada um dos papéis da escola", async () => {
      const db = createMockSupabase({
        roles: [
          { id: "r-owner", code: "owner" },
          { id: "r-admin", code: "admin" },
          { id: "r-sec", code: "secretary" },
          { id: "r-treasury", code: "treasury" },
          { id: "r-prof", code: "teacher" },
          { id: "r-guard", code: "guardian" },
          { id: "r-stud", code: "student" },
          { id: "r-user", code: "user" },
        ],
        permissions: [
          { id: "p-all-1", code: "academic.classes.read" },
          { id: "p-all-2", code: "academic.classes.manage" },
          { id: "p-all-3", code: "finance.payments.create" },
          { id: "p-all-4", code: "attendance.records.take" },
          { id: "p-all-5", code: "communication.inbox.read" },
          { id: "p-all-6", code: "communication.announcements.read" },
          { id: "p-super-only", code: "super.permission.system" },
        ],
      });

      await seedDefaultRolePermissions(db as any, "school-123");

      expect(db._upsertCalls.role_permissions).toHaveLength(1);
      const call = db._upsertCalls.role_permissions[0];
      expect(call.options).toEqual({
        onConflict: "school_id,role_id,permission_id",
        ignoreDuplicates: true,
      });

      const rows = call.payload as { school_id: string; role_id: string; permission_id: string }[];
      expect(rows.every((r) => r.school_id === "school-123")).toBe(true);

      // owner e admin recebem TODAS as permissões encontradas na tabela (7 permissões)
      const ownerPerms = rows.filter((r) => r.role_id === "r-owner");
      const adminPerms = rows.filter((r) => r.role_id === "r-admin");
      expect(ownerPerms).toHaveLength(7);
      expect(adminPerms).toHaveLength(7);
      expect(ownerPerms.map((r) => r.permission_id)).toEqual(
        adminPerms.map((r) => r.permission_id),
      );

      // user recebe apenas communication.inbox.read e communication.announcements.read (2 permissões)
      const userPerms = rows.filter((r) => r.role_id === "r-user");
      expect(userPerms).toHaveLength(2);
      expect(userPerms.map((r) => r.permission_id)).toContain("p-all-5");
      expect(userPerms.map((r) => r.permission_id)).toContain("p-all-6");

      // teacher recebe apenas permissões da lista de professor presentes na BD
      const teacherPerms = rows.filter((r) => r.role_id === "r-prof");
      const teacherPermIds = teacherPerms.map((r) => r.permission_id);
      expect(teacherPermIds).toContain("p-all-1"); // academic.classes.read
      expect(teacherPermIds).toContain("p-all-4"); // attendance.records.take
      expect(teacherPermIds).not.toContain("p-all-3"); // finance.payments.create (não é do professor)
    });

    it("lida com ausência das tabelas roles ou permissions sem rebentar", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const db = createMockSupabase({
        tableErrors: {
          roles: { code: "42P01", message: "relation roles does not exist" },
        },
      });

      await expect(seedDefaultRolePermissions(db as any, "school-123")).resolves.not.toThrow();
      expect(db._upsertCalls.role_permissions).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("lida com ausência da tabela role_permissions (42P01 / PGRST205) sem lançar excepção", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const db = createMockSupabase({
        tableErrors: {
          role_permissions: {
            code: "PGRST205",
            message: "could not find table 'role_permissions' in schema cache",
          },
        },
      });

      await expect(seedDefaultRolePermissions(db as any, "school-123")).resolves.not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("bootstrapSchoolDefaults", () => {
    it("executa fluxo completo de bootstrap para uma nova escola", async () => {
      const db = createMockSupabase({
        existingRolesCodes: [], // nenhuma role existe ainda
        activeAcademicYear: { id: "year-active-1" },
        existingFeePlan: null,
        existingEnrollmentForm: null,
        existingSchoolSettings: null,
      });

      const res = await bootstrapSchoolDefaults(db as any, {
        schoolId: "school-novo-1",
        schoolName: "Colégio Esperança",
        slug: "colegio-esperanca",
        adminUserId: "user-admin-uuid-1",
      });

      // 1. Chamou bootstrap do ano lectivo e estrutura académica
      expect(bootstrapAcademicYearIfMissing).toHaveBeenCalledWith(db, {
        schoolId: "school-novo-1",
      });
      expect(bootstrapAcademicStructure).toHaveBeenCalledWith(db, {
        schoolId: "school-novo-1",
        userId: "user-admin-uuid-1",
      });

      // 2. Criou plano financeiro e itens de propina padrão
      expect(db._insertCalls.fee_plans).toHaveLength(1);
      expect(db._insertCalls.fee_plans[0]).toMatchObject({
        school_id: "school-novo-1",
        academic_year_id: "year-active-1",
        status: "active",
      });
      expect(db._insertCalls.fee_items).toHaveLength(1);
      expect(db._insertCalls.fee_items[0].length).toBeGreaterThan(0);

      // 3. Criou formulário de matrícula público com slug e adminUserId
      expect(db._insertCalls.enrollment_forms).toHaveLength(1);
      expect(db._insertCalls.enrollment_forms[0]).toMatchObject({
        school_id: "school-novo-1",
        slug: "colegio-esperanca",
        title: "Candidatura a matrícula",
        subtitle: "Colégio Esperança",
        is_open: true,
        created_by: "user-admin-uuid-1",
        updated_by: "user-admin-uuid-1",
      });

      // 4. Criou school_settings com domínio 'academic' e changed_by
      expect(db._insertCalls.school_settings).toHaveLength(1);
      expect(db._insertCalls.school_settings[0]).toMatchObject({
        school_id: "school-novo-1",
        domain: "academic",
        changed_by: "user-admin-uuid-1",
      });

      // 5. Inseriu os 8 papéis canónicos que faltavam
      expect(db._insertCalls.roles).toHaveLength(1);
      expect(db._insertCalls.roles[0]).toHaveLength(8);

      // 6. Semeou permissões de papéis e sequências de documentos
      expect(db._upsertCalls.role_permissions).toBeDefined();
      expect(db._upsertCalls.document_sequences).toBeDefined();

      // 7. Retornou os elementos adicionados no array seeded
      expect(res.seeded).toContain("ano lectivo 2026/2027");
      expect(res.seeded).toContain("plano financeiro");
      expect(res.seeded).toContain("itens de propina");
      expect(res.seeded).toContain("formulário de matrícula");
      expect(res.seeded).toContain("definições da escola");
      expect(res.seeded).toContain("papéis RBAC");
      expect(res.seeded).toContain("disciplinas base");
    });

    it("salta a criação de itens quando já existem (idempotência)", async () => {
      const db = createMockSupabase({
        existingRolesCodes: [
          "owner",
          "admin",
          "secretary",
          "treasury",
          "teacher",
          "student",
          "guardian",
          "user",
        ],
        activeAcademicYear: { id: "year-active-1" },
        existingFeePlan: { id: "plan-already-exists" },
        existingEnrollmentForm: { id: "form-already-exists" },
        existingSchoolSettings: { school_id: "school-already" },
      });

      const res = await bootstrapSchoolDefaults(db as any, {
        schoolId: "school-already",
        schoolName: "Colégio Existente",
        slug: "colegio-existente",
        adminUserId: "admin-1",
      });

      // Não deve ter feito inserts para fee_plans, enrollment_forms, school_settings ou roles
      expect(db._insertCalls.fee_plans).toBeUndefined();
      expect(db._insertCalls.fee_items).toBeUndefined();
      expect(db._insertCalls.enrollment_forms).toBeUndefined();
      expect(db._insertCalls.school_settings).toBeUndefined();
      expect(db._insertCalls.roles).toBeUndefined();

      // Seeded array não deve conter os itens que já existiam
      expect(res.seeded).not.toContain("plano financeiro");
      expect(res.seeded).not.toContain("formulário de matrícula");
      expect(res.seeded).not.toContain("definições da escola");
      expect(res.seeded).not.toContain("papéis RBAC");
    });

    it("insere apenas os papéis canónicos que ainda não existem", async () => {
      const db = createMockSupabase({
        existingRolesCodes: ["owner", "admin"], // apenas owner e admin existem
        activeAcademicYear: null,
        existingFeePlan: null,
        existingEnrollmentForm: { id: "form-1" },
        existingSchoolSettings: { school_id: "school-1" },
      });

      await bootstrapSchoolDefaults(db as any, {
        schoolId: "school-1",
        schoolName: "Escola Parcial",
        slug: "escola-parcial",
        adminUserId: "admin-1",
      });

      // Deve ter inserido os 6 papéis restantes
      expect(db._insertCalls.roles).toHaveLength(1);
      const insertedRoles = db._insertCalls.roles[0] as { code: string; school_id: string }[];
      expect(insertedRoles).toHaveLength(6);
      const insertedCodes = insertedRoles.map((r) => r.code);
      expect(insertedCodes).toEqual([
        "secretary",
        "treasury",
        "teacher",
        "student",
        "guardian",
        "user",
      ]);
      expect(insertedCodes).not.toContain("owner");
      expect(insertedCodes).not.toContain("admin");
    });

    it("tolera ausência de ano lectivo activo sem tentar criar plano financeiro inválido", async () => {
      const db = createMockSupabase({
        activeAcademicYear: null, // sem ano activo
        existingFeePlan: null,
      });

      const res = await bootstrapSchoolDefaults(db as any, {
        schoolId: "school-no-year",
        schoolName: "Escola Sem Ano",
        slug: "escola-sem-ano",
        adminUserId: "admin-1",
      });

      // Como academic_year_id é NOT NULL, o insert não pode ser chamado
      expect(db._insertCalls.fee_plans).toBeUndefined();
      expect(db._insertCalls.fee_items).toBeUndefined();
      expect(res.seeded).not.toContain("plano financeiro");
    });
  });
});
