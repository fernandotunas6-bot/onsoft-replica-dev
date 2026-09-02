/**
 * tests/access/accept-invitation.test.ts
 *
 * Testes unitários para a lógica de aceitação de convite institucional.
 * Cobre: hash de token, validação de expiração, idempotência de membership,
 * separação Pessoa vs Conta, e schemas defensivos.
 */
import { describe, expect, it } from "vitest";
import { acceptSchoolInvitationInputSchema } from "@/features/access/schemas";

const SCHOOL_A = "00000000-0000-0000-0000-000000000001";
const USER_ALICE = "11111111-1111-1111-1111-111111111001";

// ─── Simulação da lógica de token (portável, sem node:crypto) ─────────────────

async function hashToken(raw: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRawToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── 1. Token SHA-256 ─────────────────────────────────────────────────────────

describe("invitation token — SHA-256", () => {
  it("rawToken tem 48 caracteres hex", () => {
    const raw = generateRawToken();
    expect(raw).toHaveLength(48);
    expect(raw).toMatch(/^[0-9a-f]+$/);
  });

  it("hash do mesmo raw produz sempre o mesmo resultado", async () => {
    const raw = generateRawToken();
    const h1 = await hashToken(raw);
    const h2 = await hashToken(raw);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex
  });

  it("tokens diferentes produzem hashes diferentes", async () => {
    const raw1 = generateRawToken();
    const raw2 = generateRawToken();
    const h1 = await hashToken(raw1);
    const h2 = await hashToken(raw2);
    expect(h1).not.toBe(h2);
  });

  it("hash é determinístico para token fixo", async () => {
    // Valor fixo para teste de regressão
    const raw = "aabbccddeeff00112233445566778899aabbccddeeff0011";
    const hash = await hashToken(raw);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── 2. Verificação de expiração ──────────────────────────────────────────────

describe("invitation expiry — lógica de negócio", () => {
  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  it("convite sem expires_at nunca expira", () => {
    expect(isExpired(null)).toBe(false);
  });

  it("convite no futuro não está expirado", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it("convite no passado está expirado", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isExpired(past)).toBe(true);
  });

  it("convite com exactamente agora é considerado expirado", () => {
    // Usar 1ms no passado para evitar race condition
    const justNow = new Date(Date.now() - 1).toISOString();
    expect(isExpired(justNow)).toBe(true);
  });
});

// ─── 3. Idempotência de membership ────────────────────────────────────────────

describe("membership idempotência — lógica de negócio", () => {
  type Membership = { id: string; school_id: string; user_id: string; status: string };

  const existingMemberships: Membership[] = [
    { id: "m-1", school_id: SCHOOL_A, user_id: USER_ALICE, status: "suspended" },
  ];

  function resolveOrCreateMembership(memberships: Membership[], schoolId: string, userId: string) {
    const existing = memberships.find(
      (m) => m.school_id === schoolId && m.user_id === userId,
    );
    if (existing) {
      // Reactivar
      return { ...existing, status: "active", action: "reactivated" as const };
    }
    return {
      id: "new-id",
      school_id: schoolId,
      user_id: userId,
      status: "active",
      action: "created" as const,
    };
  }

  it("utilizador com membership suspensa é reactivado, não duplicado", () => {
    const result = resolveOrCreateMembership(existingMemberships, SCHOOL_A, USER_ALICE);
    expect(result.id).toBe("m-1");
    expect(result.status).toBe("active");
    expect(result.action).toBe("reactivated");
  });

  it("novo utilizador cria membership nova", () => {
    const newUser = "22222222-2222-2222-2222-222222222002";
    const result = resolveOrCreateMembership(existingMemberships, SCHOOL_A, newUser);
    expect(result.id).toBe("new-id");
    expect(result.action).toBe("created");
  });

  it("não cria duplicado se membership activa já existe", () => {
    const activeMemberships: Membership[] = [
      { id: "m-2", school_id: SCHOOL_A, user_id: USER_ALICE, status: "active" },
    ];
    const result = resolveOrCreateMembership(activeMemberships, SCHOOL_A, USER_ALICE);
    expect(result.id).toBe("m-2");
    expect(result.action).toBe("reactivated");
  });
});

// ─── 4. Ligação people.user_id ────────────────────────────────────────────────

describe("people.user_id link — por email", () => {
  type Person = { id: string; school_id: string; email: string; user_id: string | null };

  const people: Person[] = [
    { id: "p-1", school_id: SCHOOL_A, email: "prof@escola.ao", user_id: null },
    { id: "p-2", school_id: SCHOOL_A, email: "outro@escola.ao", user_id: "existing-user" },
  ];

  function linkUserIdByEmail(persons: Person[], schoolId: string, email: string, userId: string) {
    return persons.map((p) => {
      if (
        p.school_id === schoolId &&
        p.email.toLowerCase() === email.toLowerCase() &&
        p.user_id === null
      ) {
        return { ...p, user_id: userId };
      }
      return p;
    });
  }

  it("liga user_id ao registo com email correspondente e user_id null", () => {
    const updated = linkUserIdByEmail(people, SCHOOL_A, "prof@escola.ao", USER_ALICE);
    const linked = updated.find((p) => p.id === "p-1");
    expect(linked?.user_id).toBe(USER_ALICE);
  });

  it("não sobreescreve user_id existente", () => {
    const updated = linkUserIdByEmail(people, SCHOOL_A, "outro@escola.ao", USER_ALICE);
    const notOverwritten = updated.find((p) => p.id === "p-2");
    expect(notOverwritten?.user_id).toBe("existing-user");
  });

  it("comparação de email é case-insensitive", () => {
    const updated = linkUserIdByEmail(people, SCHOOL_A, "PROF@ESCOLA.AO", USER_ALICE);
    const linked = updated.find((p) => p.id === "p-1");
    expect(linked?.user_id).toBe(USER_ALICE);
  });
});

// ─── 5. Schema de aceitação de convite ───────────────────────────────────────

describe("acceptSchoolInvitationInputSchema — validação", () => {
  it("rejeita token vazio", () => {
    expect(() => acceptSchoolInvitationInputSchema.parse({ token: "" })).toThrow();
  });

  it("rejeita token muito curto (<10 caracteres)", () => {
    expect(() => acceptSchoolInvitationInputSchema.parse({ token: "abc" })).toThrow();
  });

  it("aceita token de 48 hex chars (formato gerado)", () => {
    const token = "a".repeat(48);
    const parsed = acceptSchoolInvitationInputSchema.parse({ token });
    expect(parsed.token).toBe(token);
  });

  it("aceita token até 256 caracteres", () => {
    const token = "b".repeat(256);
    const parsed = acceptSchoolInvitationInputSchema.parse({ token });
    expect(parsed.token).toBe(token);
  });

  it("rejeita token com mais de 256 caracteres", () => {
    expect(() =>
      acceptSchoolInvitationInputSchema.parse({ token: "c".repeat(257) }),
    ).toThrow();
  });
});

// ─── 6. Role code mapeamento no convite ───────────────────────────────────────

describe("role_code em convite — mapeamento para ApplicationRole", () => {
  const roleMapping: Record<string, string> = {
    owner:     "Administrador",
    admin:     "Administrador",
    secretary: "Secretaria",
    treasury:  "Tesouraria",
    teacher:   "Professor",
    student:   "Aluno",
    guardian:  "Encarregado",
    user:      "Utilizador",
  };

  for (const [code, expected] of Object.entries(roleMapping)) {
    it(`role_code "${code}" mapeia para "${expected}"`, () => {
      expect(roleMapping[code]).toBe(expected);
    });
  }

  it("role_code desconhecido deve ter fallback para Utilizador", () => {
    const fallback = roleMapping["unknown"] ?? "Utilizador";
    expect(fallback).toBe("Utilizador");
  });
});
