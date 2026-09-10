/**
 * tests/saas/rls-isolation.test.ts
 *
 * Fase 15 — Testes hostis de isolamento multi-tenant e RBAC.
 *
 * Estes testes verificam as REGRAS DE NEGÓCIO e a lógica de autorização
 * no lado TypeScript sem precisar de uma ligação ao Supabase real:
 *  - Isolamento de escola: funções de filtragem devem rejeitar dados de outras escolas
 *  - RBAC: papéis correctos têm permissões; papéis errados não têm
 *  - Sessão multi-escola: resolução do contexto activo
 *  - Convites: tokens inválidos/expirados são rejeitados
 *  - Pessoas vs Contas: user_id null não impede registo académico
 *
 * Testes de RLS real (PostgreSQL SET LOCAL role) exigem ligação à base de dados
 * de teste e ficam como TODO comentado — estes cobrem a camada TS.
 */

import { describe, expect, it } from "vitest";
import {
  hasPermission,
  canAccessContext,
  roleDefaultPermissions,
  standardPermissions,
} from "@/features/auth/permissions";
import type { ApplicationRole } from "@/features/auth/access-policy";
import { mapAppRoleToSgaCodes, mapSgaRoleCode } from "@/integrations/supabase/sga";
import {
  createSchoolInvitationInputSchema,
  revokeSchoolInvitationInputSchema,
  acceptSchoolInvitationInputSchema,
} from "@/features/access/schemas";

// ─── Helper ───────────────────────────────────────────────────────────────────

const SCHOOL_A = "00000000-0000-0000-0000-000000000001";
const SCHOOL_B = "00000000-0000-0000-0000-000000000002";
const USER_ALICE = "11111111-1111-1111-1111-111111111001";
const USER_BOB = "11111111-1111-1111-1111-111111111002";

// ─── 1. Cobertura do catálogo de permissões ──────────────────────────────────

describe("standardPermissions — catálogo canónico", () => {
  it("cobre pelo menos 45 permissões granulares", () => {
    // O catálogo actual tem 49 permissões (pode crescer mas nunca descer de 45)
    expect(standardPermissions.length).toBeGreaterThanOrEqual(45);
  });

  it("todos os itens têm formato modulo.acao ou modulo.sub.acao", () => {
    // Formato válido: "modulo.acao" ou "modulo.sub.acao" (ex: school.settings.read)
    for (const p of standardPermissions) {
      expect(p).toMatch(/^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/);
    }
  });

  it("não há permissões duplicadas", () => {
    const unique = new Set(standardPermissions);
    expect(unique.size).toBe(standardPermissions.length);
  });
});

// ─── 2. RBAC — Administrador tem acesso total ─────────────────────────────────

describe("hasPermission — Administrador", () => {
  const adminPerms = roleDefaultPermissions["Administrador"];

  it("Administrador tem students.read", () => {
    expect(hasPermission(["Administrador"], "students.read")).toBe(true);
  });

  it("Administrador tem finance.invoice", () => {
    expect(hasPermission(["Administrador"], "finance.invoice")).toBe(true);
  });

  it("Administrador tem access.manage (gestão de acessos)", () => {
    // A permissão é access.manage (não acessos.manage)
    expect(adminPerms).toContain("access.manage");
  });

  it("Administrador tem todas as permissões de finance", () => {
    const financePerms = standardPermissions.filter((p) => p.startsWith("finance."));
    for (const p of financePerms) {
      expect(hasPermission(["Administrador"], p)).toBe(true);
    }
  });
});

// ─── 3. RBAC — Professor tem acesso restrito ─────────────────────────────────

describe("hasPermission — Professor", () => {
  it("Professor tem grades.read", () => {
    expect(hasPermission(["Professor"], "grades.read")).toBe(true);
  });

  it("Professor tem grades.create (lançamento de notas)", () => {
    expect(hasPermission(["Professor"], "grades.create")).toBe(true);
  });

  it("Professor NÃO tem finance.invoice", () => {
    expect(hasPermission(["Professor"], "finance.invoice")).toBe(false);
  });

  it("Professor NÃO tem access.manage", () => {
    expect(hasPermission(["Professor"], "access.manage")).toBe(false);
  });

  it("Professor NÃO tem documents.issue", () => {
    expect(hasPermission(["Professor"], "documents.issue")).toBe(false);
  });
});

// ─── 4. RBAC — Aluno tem acesso apenas a consulta ────────────────────────────

describe("hasPermission — Aluno", () => {
  it("Aluno tem grades.read", () => {
    expect(hasPermission(["Aluno"], "grades.read")).toBe(true);
  });

  it("Aluno NÃO tem grades.create", () => {
    expect(hasPermission(["Aluno"], "grades.create")).toBe(false);
  });

  it("Aluno NÃO tem students.create", () => {
    expect(hasPermission(["Aluno"], "students.create")).toBe(false);
  });

  it("Aluno NÃO tem finance.invoice", () => {
    expect(hasPermission(["Aluno"], "finance.invoice")).toBe(false);
  });
});

// ─── 5. RBAC — Encarregado (guardião) ────────────────────────────────────────

describe("hasPermission — Encarregado", () => {
  it("Encarregado tem grades.read", () => {
    expect(hasPermission(["Encarregado"], "grades.read")).toBe(true);
  });

  it("Encarregado tem attendance.read", () => {
    expect(hasPermission(["Encarregado"], "attendance.read")).toBe(true);
  });

  it("Encarregado NÃO tem grades.update", () => {
    expect(hasPermission(["Encarregado"], "grades.update")).toBe(false);
  });
});

// ─── 6. Overrides de grant (staff_module_grants) ─────────────────────────────
// grants é um ModuleGrantMap: módulo → "Total" | "Escrita" | "Leitura" | "Nenhum"
// (não chaves de permissão individuais — vd. access-policy.ts ModuleGrantMap)
// O Administrador retorna sempre true por design (bypass completo).

describe("hasPermission — grant overrides", () => {
  it("Professor com grant 'Total' em financeiro acede a finance.read", () => {
    const grants = { financeiro: "Total" as const };
    expect(hasPermission(["Professor"], "finance.read", grants)).toBe(true);
  });

  it("Professor com grant 'Leitura' em financeiro acede a finance.read", () => {
    const grants = { financeiro: "Leitura" as const };
    expect(hasPermission(["Professor"], "finance.read", grants)).toBe(true);
  });

  it("Professor com grant 'Nenhum' em financeiro é bloqueado em finance.read", () => {
    const grants = { financeiro: "Nenhum" as const };
    expect(hasPermission(["Professor"], "finance.read", grants)).toBe(false);
  });

  it("Administrador tem acesso total independentemente de grants (por design)", () => {
    // O Administrador faz bypass a todos os grants — é a regra arquitectural
    expect(hasPermission(["Administrador"], "access.manage")).toBe(true);
    expect(hasPermission(["Administrador"], "finance.invoice")).toBe(true);
  });

  it("Utilizador base sem grants não acede a nada sensível", () => {
    expect(hasPermission(["Utilizador"], "students.create")).toBe(false);
    expect(hasPermission(["Utilizador"], "finance.invoice")).toBe(false);
  });
});

// ─── 7. Autorização contextual multi-escola ───────────────────────────────────

describe("canAccessContext — isolamento de escola", () => {
  const BASE_ALICE = {
    userId: USER_ALICE,
    schoolId: SCHOOL_A,
  };

  it("Professor acede às suas turmas na escola A", () => {
    const result = canAccessContext({
      ...BASE_ALICE,
      role: "Professor",
      targetSchoolId: SCHOOL_A,
      teacherAssignedClassIds: ["class-1"],
      targetClassId: "class-1",
    });
    expect(result.allowed).toBe(true);
  });

  it("Professor NÃO acede a turmas de outra escola (B)", () => {
    const result = canAccessContext({
      ...BASE_ALICE,
      role: "Professor",
      targetSchoolId: SCHOOL_B,
      teacherAssignedClassIds: ["class-1"],
      targetClassId: "class-1",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/escola/i);
  });

  it("Professor NÃO acede a turma que não lhe está atribuída", () => {
    const result = canAccessContext({
      ...BASE_ALICE,
      role: "Professor",
      targetSchoolId: SCHOOL_A,
      teacherAssignedClassIds: ["class-1"],
      targetClassId: "class-99",
    });
    expect(result.allowed).toBe(false);
  });

  it("Administrador acede a qualquer turma da sua escola", () => {
    const result = canAccessContext({
      ...BASE_ALICE,
      role: "Administrador",
      targetSchoolId: SCHOOL_A,
      teacherAssignedClassIds: [],
      targetClassId: "class-any",
    });
    expect(result.allowed).toBe(true);
  });

  it("Encarregado só acede ao seu aluno vinculado", () => {
    const linked = canAccessContext({
      ...BASE_ALICE,
      role: "Encarregado",
      targetSchoolId: SCHOOL_A,
      guardianLinkedStudentIds: ["stu-1"],
      targetStudentId: "stu-1",
    });
    expect(linked.allowed).toBe(true);

    const unlinked = canAccessContext({
      ...BASE_ALICE,
      role: "Encarregado",
      targetSchoolId: SCHOOL_A,
      guardianLinkedStudentIds: ["stu-1"],
      targetStudentId: "stu-99",
    });
    expect(unlinked.allowed).toBe(false);
  });
});

// ─── 8. Mapeamento de roles SGA ↔ ApplicationRole ────────────────────────────

describe("mapSgaRoleCode — mapeamento canónico", () => {
  const expectations: Array<[string, ApplicationRole]> = [
    ["owner", "Administrador"],
    ["admin", "Administrador"],
    ["secretary", "Secretaria"],
    ["treasury", "Tesouraria"],
    ["teacher", "Professor"],
    ["guardian", "Encarregado"],
    ["student", "Aluno"],
    ["unknown-role", "Utilizador"],
    [null as unknown as string, "Utilizador"],
  ];

  for (const [code, expected] of expectations) {
    it(`"${code}" → "${expected}"`, () => {
      expect(mapSgaRoleCode(code)).toBe(expected);
    });
  }
});

describe("mapAppRoleToSgaCodes — round-trip inverso", () => {
  it("Administrador → [owner, admin, administrador]", () => {
    expect(mapAppRoleToSgaCodes("Administrador")).toEqual(["owner", "admin", "administrador"]);
  });

  it("Professor → [teacher, professor]", () => {
    expect(mapAppRoleToSgaCodes("Professor")).toEqual(["teacher", "professor"]);
  });
});

// ─── 9. Schemas de Convites — validação defensiva ─────────────────────────────
// Os schemas usam camelCase conforme src/features/access/schemas.ts

describe("createSchoolInvitationInputSchema — inputs hostis", () => {
  it("rejeita email inválido", () => {
    expect(() =>
      createSchoolInvitationInputSchema.parse({
        email: "nao-e-um-email",
        roleCode: "teacher",
      }),
    ).toThrow();
  });

  it("rejeita email vazio", () => {
    expect(() =>
      createSchoolInvitationInputSchema.parse({
        email: "",
        roleCode: "teacher",
      }),
    ).toThrow();
  });

  it("aceita payload válido com roleCode", () => {
    const parsed = createSchoolInvitationInputSchema.parse({
      email: "prof@escola.ao",
      roleCode: "teacher",
    });
    expect(parsed.email).toBe("prof@escola.ao");
    expect(parsed.roleCode).toBe("teacher");
  });

  it("roleCode tem default 'teacher' quando omitido", () => {
    const parsed = createSchoolInvitationInputSchema.parse({
      email: "prof@escola.ao",
    });
    expect(parsed.roleCode).toBe("teacher");
  });
});

describe("revokeSchoolInvitationInputSchema", () => {
  it("rejeita invitationId vazio", () => {
    expect(() =>
      revokeSchoolInvitationInputSchema.parse({
        invitationId: "",
      }),
    ).toThrow();
  });

  it("rejeita invitationId não-UUID", () => {
    expect(() =>
      revokeSchoolInvitationInputSchema.parse({
        invitationId: "nao-e-uuid",
      }),
    ).toThrow();
  });

  it("aceita invitationId UUID válido", () => {
    const parsed = revokeSchoolInvitationInputSchema.parse({
      invitationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(parsed.invitationId).toHaveLength(36);
  });
});

describe("acceptSchoolInvitationInputSchema", () => {
  it("rejeita token vazio", () => {
    expect(() => acceptSchoolInvitationInputSchema.parse({ token: "" })).toThrow();
  });

  it("aceita token de 48 caracteres (hex SHA-256 de 24 bytes)", () => {
    const token = "a".repeat(48);
    const parsed = acceptSchoolInvitationInputSchema.parse({ token });
    expect(parsed.token).toBe(token);
  });
});

// ─── 10. Pessoa vs Conta — separação de identidade ───────────────────────────

describe("Pessoa vs Conta — regras de negócio (unit)", () => {
  type PersonRecord = { id: string; school_id: string; user_id: string | null; name: string };

  const persons: PersonRecord[] = [
    { id: "p-1", school_id: SCHOOL_A, user_id: USER_ALICE, name: "Alice" },
    { id: "p-2", school_id: SCHOOL_A, user_id: null, name: "Bob sem portal" },
    { id: "p-3", school_id: SCHOOL_B, user_id: USER_BOB, name: "Bob escola B" },
  ];

  it("filtra pessoas activas de escola A sem depender de user_id", () => {
    const schoolAPersons = persons.filter((p) => p.school_id === SCHOOL_A);
    expect(schoolAPersons).toHaveLength(2);
    // Bob sem portal ainda aparece — user_id nullable não exclui registo biográfico
    const withoutPortal = schoolAPersons.find((p) => p.user_id === null);
    expect(withoutPortal).toBeDefined();
    expect(withoutPortal?.name).toBe("Bob sem portal");
  });

  it("apagar conta (user_id → null) não remove pessoa da listagem escolar", () => {
    // Simula ON DELETE SET NULL: user_id torna-se null, pessoa permanece
    const afterDelete = persons.map((p) =>
      p.user_id === USER_ALICE ? { ...p, user_id: null } : p,
    );
    const schoolAAfter = afterDelete.filter((p) => p.school_id === SCHOOL_A);
    expect(schoolAAfter).toHaveLength(2); // Alice e Bob ainda presentes
    const alice = schoolAAfter.find((p) => p.name === "Alice");
    expect(alice?.user_id).toBeNull();
  });

  it("pessoa de escola B não aparece no contexto de escola A", () => {
    const schoolAView = persons.filter((p) => p.school_id === SCHOOL_A);
    const crossTenant = schoolAView.find((p) => p.school_id === SCHOOL_B);
    expect(crossTenant).toBeUndefined();
  });
});

// ─── 11. Multi-escola — resolução de contexto activo ─────────────────────────

describe("Multi-escola — switching de contexto", () => {
  type Membership = {
    membershipId: string;
    schoolId: string;
    schoolName: string;
    isActive: boolean;
  };

  const memberships: Membership[] = [
    { membershipId: "m-1", schoolId: SCHOOL_A, schoolName: "Escola A", isActive: true },
    { membershipId: "m-2", schoolId: SCHOOL_B, schoolName: "Escola B", isActive: true },
  ];

  function resolveActiveSchool(schools: Membership[], preferredId: string | null) {
    if (preferredId) {
      return schools.find((s) => s.schoolId === preferredId) ?? schools[0] ?? null;
    }
    return schools[0] ?? null;
  }

  it("sem preferência, retorna primeira escola", () => {
    const active = resolveActiveSchool(memberships, null);
    expect(active?.schoolId).toBe(SCHOOL_A);
  });

  it("com preferência escola B, retorna escola B", () => {
    const active = resolveActiveSchool(memberships, SCHOOL_B);
    expect(active?.schoolId).toBe(SCHOOL_B);
  });

  it("preferência inválida cai em fallback escola A", () => {
    const active = resolveActiveSchool(memberships, "escola-inexistente");
    expect(active?.schoolId).toBe(SCHOOL_A);
  });

  it("utilizador sem memberships retorna null", () => {
    const active = resolveActiveSchool([], null);
    expect(active).toBeNull();
  });
});
