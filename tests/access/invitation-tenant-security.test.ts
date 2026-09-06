import { describe, expect, it } from "vitest";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function canAcceptInvitation(invitedEmail: string, authenticatedEmail: string) {
  return Boolean(authenticatedEmail) && normalizeEmail(invitedEmail) === normalizeEmail(authenticatedEmail);
}

function canInviteRole(inviterRole: string, roleCode: string) {
  const normalized = roleCode.trim().toLowerCase();
  if (normalized === "owner") return false;
  if (normalized === "admin") return inviterRole === "Administrador";
  return inviterRole === "Administrador" || inviterRole === "Secretaria";
}

type Role = { id: string; school_id: string; code: string };

function resolveTenantRole(roles: Role[], schoolId: string, roleCode: string) {
  return roles.find(
    (role) => role.school_id === schoolId && role.code.toLowerCase() === roleCode.toLowerCase(),
  );
}

describe("school invitation security invariants", () => {
  it("only the account owning the invited email can accept the token", () => {
    expect(canAcceptInvitation("teacher@school.ao", "teacher@school.ao")).toBe(true);
    expect(canAcceptInvitation("Teacher@School.ao ", " teacher@school.ao")).toBe(true);
    expect(canAcceptInvitation("teacher@school.ao", "attacker@school.ao")).toBe(false);
    expect(canAcceptInvitation("teacher@school.ao", "")).toBe(false);
  });

  it("owner can never be assigned through a school invitation", () => {
    expect(canInviteRole("Administrador", "owner")).toBe(false);
    expect(canInviteRole("Secretaria", "owner")).toBe(false);
  });

  it("Secretaria cannot invite another Administrator", () => {
    expect(canInviteRole("Secretaria", "admin")).toBe(false);
    expect(canInviteRole("Administrador", "admin")).toBe(true);
  });

  it("resolves a role only inside the invitation school", () => {
    const roles: Role[] = [
      { id: "role-a", school_id: "school-a", code: "teacher" },
      { id: "role-b", school_id: "school-b", code: "teacher" },
    ];

    expect(resolveTenantRole(roles, "school-a", "teacher")?.id).toBe("role-a");
    expect(resolveTenantRole(roles, "school-b", "teacher")?.id).toBe("role-b");
    expect(resolveTenantRole(roles, "school-c", "teacher")).toBeUndefined();
  });

  it("never treats a same-code role from another school as valid", () => {
    const roles: Role[] = [{ id: "foreign-role", school_id: "school-b", code: "admin" }];
    expect(resolveTenantRole(roles, "school-a", "admin")).toBeUndefined();
  });
});
