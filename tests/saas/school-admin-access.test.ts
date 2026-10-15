import { describe, expect, it } from "vitest";
import {
  assessSchoolAdminAccess,
  schoolAdminAccessReady,
  type SchoolAdminAccessSnapshot,
  type SchoolAdminAccountSnapshot,
} from "@/features/saas/school-admin-access-rules";

const NOW = new Date("2026-10-15T12:00:00Z");

function admin(over: Partial<SchoolAdminAccountSnapshot> = {}): SchoolAdminAccountSnapshot {
  return {
    userId: "u1",
    email: "director@escola.ao",
    roleCodes: ["owner"],
    rolePermissions: 120,
    accountExists: true,
    emailConfirmed: true,
    lastSignInAt: "2026-10-10T10:00:00Z",
    bannedUntil: null,
    hasProfile: true,
    profileSchoolId: "s1",
    verifiedFactors: 1,
    ...over,
  };
}

function snapshot(over: Partial<SchoolAdminAccessSnapshot> = {}): SchoolAdminAccessSnapshot {
  return {
    tenant: {
      id: "t1",
      name: "Escola",
      slug: "escola",
      status: "active",
      subscription_status: "trialing",
      trial_ends_at: "2026-10-30T00:00:00Z",
    },
    school: { id: "s1", name: "Escola", status: "active" },
    admins: [admin()],
    ...over,
  };
}

const codes = (s: SchoolAdminAccessSnapshot) => assessSchoolAdminAccess(s, NOW).map((i) => i.code);

describe("assessSchoolAdminAccess", () => {
  it("escola completa e activa não tem problemas", () => {
    const issues = assessSchoolAdminAccess(snapshot(), NOW);
    expect(issues).toEqual([]);
    expect(schoolAdminAccessReady(issues)).toBe(true);
  });

  it("trial terminado bloqueia a configuração e resolve-se pela assinatura", () => {
    const s = snapshot();
    s.tenant.trial_ends_at = "2026-10-01T00:00:00Z";
    const issues = assessSchoolAdminAccess(s, NOW);
    expect(issues[0]).toMatchObject({ code: "trial_expired", fix: "subscription" });
    expect(schoolAdminAccessReady(issues)).toBe(false);
  });

  it("tenant suspenso é bloqueio", () => {
    const s = snapshot();
    s.tenant.status = "suspended";
    expect(codes(s)).toContain("tenant_blocked");
  });

  it("sem administrador não há a quem dar acesso", () => {
    expect(codes(snapshot({ admins: [] }))).toEqual(["no_admin"]);
  });

  it("sem escola pára no primeiro problema", () => {
    expect(codes(snapshot({ school: null }))).toEqual(["school_missing"]);
  });

  it("papel sem permissões e e-mail por confirmar corrigem-se sozinhos", () => {
    const issues = assessSchoolAdminAccess(
      snapshot({ admins: [admin({ rolePermissions: 0, emailConfirmed: false })] }),
      NOW,
    );
    const auto = issues.filter((i) => i.fix === "auto").map((i) => i.code);
    expect(auto).toEqual(["email_unconfirmed", "role_without_permissions"]);
    expect(schoolAdminAccessReady(issues)).toBe(false);
  });

  it("perfil em falta ou sem escola é aviso, não bloqueio", () => {
    const missing = assessSchoolAdminAccess(
      snapshot({ admins: [admin({ hasProfile: false })] }),
      NOW,
    );
    expect(missing.map((i) => i.code)).toEqual(["profile_missing"]);
    expect(schoolAdminAccessReady(missing)).toBe(true);
    expect(codes(snapshot({ admins: [admin({ profileSchoolId: null })] }))).toEqual([
      "profile_without_school",
    ]);
  });

  it("quem nunca entrou recebe um link de acesso", () => {
    const issues = assessSchoolAdminAccess(
      snapshot({ admins: [admin({ lastSignInAt: null })] }),
      NOW,
    );
    expect(issues).toEqual([
      expect.objectContaining({ code: "never_signed_in", fix: "access_link", userId: "u1" }),
    ]);
  });

  it("sem 2FA é recomendação ao próprio", () => {
    expect(
      assessSchoolAdminAccess(snapshot({ admins: [admin({ verifiedFactors: 0 })] }), NOW),
    ).toEqual([expect.objectContaining({ code: "mfa_missing", severity: "info", fix: "user" })]);
  });

  it("conta bloqueada ou apagada nunca se corrige sozinha", () => {
    const banned = assessSchoolAdminAccess(
      snapshot({ admins: [admin({ bannedUntil: "2027-01-01T00:00:00Z" })] }),
      NOW,
    );
    expect(banned[0]).toMatchObject({ code: "account_banned", fix: "manual" });
    expect(codes(snapshot({ admins: [admin({ accountExists: false })] }))).toEqual([
      "account_missing",
    ]);
  });
});
