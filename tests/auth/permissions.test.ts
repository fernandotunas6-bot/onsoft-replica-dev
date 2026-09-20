import { describe, expect, it } from "vitest";
import {
  hasPermission,
  canAccessContext,
  standardPermissions,
  roleDefaultPermissions,
} from "@/features/auth/permissions";
import type { ApplicationRole } from "@/features/auth/access-policy";

describe("Enterprise Permissions & Contextual Authorization", () => {
  it("defines comprehensive standard permissions", () => {
    expect(standardPermissions).toContain("students.read");
    expect(standardPermissions).toContain("students.create");
    expect(standardPermissions).toContain("grades.update");
    expect(standardPermissions).toContain("finance.invoice");
    expect(standardPermissions).toContain("attendance.manage");
    expect(standardPermissions).toContain("turnstiles.relay");
  });

  describe("hasPermission", () => {
    it("grants full access to Administrador", () => {
      for (const permission of standardPermissions) {
        expect(hasPermission("Administrador", permission)).toBe(true);
      }
    });

    it("evaluates Professor permissions accurately", () => {
      expect(hasPermission("Professor", "grades.update")).toBe(true);
      expect(hasPermission("Professor", "grades.read")).toBe(true);
      expect(hasPermission("Professor", "attendance.manage")).toBe(true);
      expect(hasPermission("Professor", "finance.invoice")).toBe(false);
      expect(hasPermission("Professor", "school.settings.update")).toBe(false);
    });

    it("evaluates Tesouraria permissions accurately", () => {
      expect(hasPermission("Tesouraria", "finance.invoice")).toBe(true);
      expect(hasPermission("Tesouraria", "finance.payment")).toBe(true);
      expect(hasPermission("Tesouraria", "finance.export_saft")).toBe(true);
      expect(hasPermission("Tesouraria", "grades.create")).toBe(false);
    });

    it("respects custom module grant overrides", () => {
      // Professor granted Total access on financeiro
      expect(hasPermission("Professor", "finance.invoice", { financeiro: "Total" })).toBe(true);

      // Secretaria restricted with Nenhum on pessoas
      expect(hasPermission("Secretaria", "students.create", { pessoas: "Nenhum" })).toBe(false);
    });

    it("supports multi-role users", () => {
      // User with Professor + Tesouraria
      const roles: ApplicationRole[] = ["Professor", "Tesouraria"];
      expect(hasPermission(roles, "grades.create")).toBe(true);
      expect(hasPermission(roles, "finance.invoice")).toBe(true);
      expect(hasPermission(roles, "school.settings.update")).toBe(false);
    });
  });

  describe("canAccessContext (Contextual Authorization)", () => {
    const schoolA = "school-a-uuid";
    const schoolB = "school-b-uuid";

    it("blocks access across different schools (Tenant Boundary)", () => {
      const result = canAccessContext({
        userId: "user-1",
        role: "Administrador",
        schoolId: schoolA,
        targetSchoolId: schoolB,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("escola diferente");
    });

    it("allows Administrador within same school unconditionally", () => {
      const result = canAccessContext({
        userId: "admin-1",
        role: "Administrador",
        schoolId: schoolA,
        targetSchoolId: schoolA,
        targetClassId: "class-10",
      });
      expect(result.allowed).toBe(true);
    });

    it("validates teacher class assignment context", () => {
      // Teacher assigned to class-1 and class-2
      const assigned = ["class-1", "class-2"];

      // Access to assigned class -> Allowed
      const allowedResult = canAccessContext({
        userId: "teacher-1",
        role: "Professor",
        schoolId: schoolA,
        targetSchoolId: schoolA,
        teacherAssignedClassIds: assigned,
        targetClassId: "class-1",
      });
      expect(allowedResult.allowed).toBe(true);

      // Access to unassigned class -> Denied
      const deniedResult = canAccessContext({
        userId: "teacher-1",
        role: "Professor",
        schoolId: schoolA,
        targetSchoolId: schoolA,
        teacherAssignedClassIds: assigned,
        targetClassId: "class-99",
      });
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.reason).toContain("turma não atribuída");
    });

    it("validates guardian student relation context", () => {
      const linked = ["student-1", "student-2"];

      // Access to linked child -> Allowed
      const allowedResult = canAccessContext({
        userId: "parent-1",
        role: "Encarregado",
        schoolId: schoolA,
        targetSchoolId: schoolA,
        guardianLinkedStudentIds: linked,
        targetStudentId: "student-1",
      });
      expect(allowedResult.allowed).toBe(true);

      // Access to another child -> Denied
      const deniedResult = canAccessContext({
        userId: "parent-1",
        role: "Encarregado",
        schoolId: schoolA,
        targetSchoolId: schoolA,
        guardianLinkedStudentIds: linked,
        targetStudentId: "student-99",
      });
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.reason).toContain("educando não vinculado");
    });
  });
});
