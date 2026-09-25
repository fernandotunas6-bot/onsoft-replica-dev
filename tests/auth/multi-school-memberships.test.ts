import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapAppRoleToSgaCodes,
  mapSgaRoleCode,
  listUserSchoolMemberships,
  resolveSgaMembership,
} from "@/integrations/supabase/sga";

describe("Multi-School Memberships & Roles Architecture", () => {
  describe("Role Mapping", () => {
    it("maps standard school role codes to ApplicationRole", () => {
      expect(mapSgaRoleCode("owner")).toBe("Administrador");
      expect(mapSgaRoleCode("admin")).toBe("Administrador");
      expect(mapSgaRoleCode("teacher")).toBe("Professor");
      expect(mapSgaRoleCode("professor")).toBe("Professor");
      expect(mapSgaRoleCode("secretary")).toBe("Secretaria");
      expect(mapSgaRoleCode("treasury")).toBe("Tesouraria");
      expect(mapSgaRoleCode("parent")).toBe("Encarregado");
      expect(mapSgaRoleCode("guardian")).toBe("Encarregado");
      expect(mapSgaRoleCode("student")).toBe("Aluno");
      expect(mapSgaRoleCode("unknown")).toBe("Utilizador");
      expect(mapSgaRoleCode(null)).toBe("Utilizador");
    });

    it("maps ApplicationRoles back to database SGA codes", () => {
      expect(mapAppRoleToSgaCodes("Administrador")).toContain("owner");
      expect(mapAppRoleToSgaCodes("Professor")).toContain("teacher");
      expect(mapAppRoleToSgaCodes("Secretaria")).toContain("secretary");
      expect(mapAppRoleToSgaCodes("Tesouraria")).toContain("treasury");
      expect(mapAppRoleToSgaCodes("Encarregado")).toContain("guardian");
      expect(mapAppRoleToSgaCodes("Aluno")).toContain("student");
    });
  });

  describe("Multi-School Resolution", () => {
    const fakeUserId = "user-123-uuid";
    const schoolAId = "school-a-uuid";
    const schoolBId = "school-b-uuid";
    const schoolCId = "school-c-uuid";

    it("resolves multi-school memberships for single user", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "school_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: "mem-1", school_id: schoolAId, status: "active", created_at: "2026-01-01" },
                  { id: "mem-2", school_id: schoolBId, status: "active", created_at: "2026-02-01" },
                  { id: "mem-3", school_id: schoolCId, status: "active", created_at: "2026-03-01" },
                ],
                error: null,
              }),
            };
          }
          if (table === "schools") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: schoolAId, name: "Colégio Esperança", status: "active", slug: "colegio-esperanca" },
                  { id: schoolBId, name: "Universidade Central", status: "active", slug: "universidade-central" },
                  { id: schoolCId, name: "Escola Horizonte", status: "active", slug: "escola-horizonte" },
                ],
                error: null,
              }),
            };
          }
          if (table === "member_roles") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { membership_id: "mem-1", role_id: "role-teacher" },
                  { membership_id: "mem-2", role_id: "role-director" },
                  { membership_id: "mem-3", role_id: "role-guardian" },
                ],
                error: null,
              }),
            };
          }
          if (table === "roles") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "role-teacher", code: "teacher", name: "Professor" },
                  { id: "role-director", code: "owner", name: "Diretor / Proprietário" },
                  { id: "role-guardian", code: "guardian", name: "Encarregado de Educação" },
                ],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const memberships = await listUserSchoolMemberships(
        mockClient as unknown as SupabaseClient,
        fakeUserId,
      );
      expect(memberships).toHaveLength(3);

      expect(memberships[0]).toMatchObject({
        schoolId: schoolAId,
        schoolName: "Colégio Esperança",
        appRole: "Professor",
        isActive: true,
      });

      expect(memberships[1]).toMatchObject({
        schoolId: schoolBId,
        schoolName: "Universidade Central",
        appRole: "Administrador",
        isActive: true,
      });

      expect(memberships[2]).toMatchObject({
        schoolId: schoolCId,
        schoolName: "Escola Horizonte",
        appRole: "Encarregado",
        isActive: true,
      });
    });

    it("switches context to preferredSchoolId when specified", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "school_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: "mem-1", school_id: schoolAId, status: "active", created_at: "2026-01-01" },
                  { id: "mem-2", school_id: schoolBId, status: "active", created_at: "2026-02-01" },
                ],
                error: null,
              }),
            };
          }
          if (table === "schools") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: schoolAId, name: "Colégio Esperança", status: "active", slug: "colegio-esperanca" },
                  { id: schoolBId, name: "Universidade Central", status: "active", slug: "universidade-central" },
                ],
                error: null,
              }),
            };
          }
          if (table === "member_roles") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { membership_id: "mem-1", role_id: "role-teacher" },
                  { membership_id: "mem-2", role_id: "role-admin" },
                ],
                error: null,
              }),
            };
          }
          if (table === "roles") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "role-teacher", code: "teacher", name: "Professor" },
                  { id: "role-admin", code: "admin", name: "Administrador" },
                ],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      // By default without preferredSchoolId -> resolves first school (School A / Professor)
      const defaultResolved = await resolveSgaMembership(
        mockClient as unknown as SupabaseClient,
        fakeUserId,
      );
      expect(defaultResolved?.schoolId).toBe(schoolAId);
      expect(defaultResolved?.appRole).toBe("Professor");

      // With preferredSchoolId = schoolBId -> resolves School B / Administrador
      const switchedResolved = await resolveSgaMembership(
        mockClient as unknown as SupabaseClient,
        fakeUserId,
        schoolBId,
      );
      expect(switchedResolved?.schoolId).toBe(schoolBId);
      expect(switchedResolved?.appRole).toBe("Administrador");
      expect(switchedResolved?.schoolName).toBe("Universidade Central");
    });
  });
});
