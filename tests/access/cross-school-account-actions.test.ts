import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { otherSchoolAccess } from "@/features/access/server";

type Membership = { id: string; school_id: string; status: string };

/** Cliente mínimo: só as duas consultas que otherSchoolAccess faz. */
function fakeAdmin(memberships: Membership[], roleCodes: Record<string, string[]>) {
  return {
    from(table: string) {
      if (table === "school_memberships") {
        return { select: () => ({ eq: async () => ({ data: memberships }) }) };
      }
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => ({
            data: ids.flatMap((id) => (roleCodes[id] ?? []).map((code) => ({ roles: { code } }))),
          }),
        }),
      };
    },
  } as unknown as Parameters<typeof otherSchoolAccess>[0];
}

describe("acções sobre a conta inteira (senha, bloqueio) entre escolas", () => {
  it("só esta escola: pode agir sobre a conta", async () => {
    const access = await otherSchoolAccess(
      fakeAdmin([{ id: "m1", school_id: "A", status: "active" }], { m1: ["teacher"] }),
      "u",
      "A",
    );
    expect(access).toEqual({ hasOtherActiveSchools: false, adminAnywhere: false });
  });

  it("detecta acesso activo a outra escola", async () => {
    const access = await otherSchoolAccess(
      fakeAdmin(
        [
          { id: "m1", school_id: "A", status: "active" },
          { id: "m2", school_id: "B", status: "active" },
        ],
        { m1: ["student"], m2: ["teacher"] },
      ),
      "u",
      "A",
    );
    expect(access.hasOtherActiveSchools).toBe(true);
  });

  it("ignora memberships suspensas noutras escolas", async () => {
    const access = await otherSchoolAccess(
      fakeAdmin(
        [
          { id: "m1", school_id: "A", status: "active" },
          { id: "m2", school_id: "B", status: "suspended" },
        ],
        {},
      ),
      "u",
      "A",
    );
    expect(access.hasOtherActiveSchools).toBe(false);
  });

  it("administrador noutra escola conta como administrador (o cargo global não chega)", async () => {
    const access = await otherSchoolAccess(
      fakeAdmin(
        [
          { id: "m1", school_id: "A", status: "active" },
          { id: "m2", school_id: "B", status: "active" },
        ],
        { m1: ["teacher"], m2: ["owner"] },
      ),
      "u",
      "A",
    );
    expect(access.adminAnywhere).toBe(true);
  });
});
