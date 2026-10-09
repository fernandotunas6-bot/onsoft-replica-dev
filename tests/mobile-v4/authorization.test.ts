import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  list: vi.fn(),
  grant: vi.fn(),
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: mocks.load,
  assertModuleNotBlocked: mocks.grant,
}));
vi.mock("@/integrations/supabase/sga", () => ({ listUserSchoolMemberships: mocks.list }));

import { requireMobileAcademicAccess } from "@/features/mobile-v4/authorization";
import { applyMobileV4Command } from "@/features/mobile-v4/operations-core.server";
import { mapMobileMemberships } from "@/features/mobile-v4/session-core.server";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
let active: { data: { id: string } | null; error: unknown };
let filters: Record<string, string>;
beforeEach(() => {
  vi.clearAllMocks();
  filters = {};
  active = { data: { id: "membership-b" }, error: null };
  const chain = {
    select: () => chain,
    eq: (field: string, value: string) => {
      filters[field] = value;
      return chain;
    },
    maybeSingle: async () => active,
  };
  mocks.load.mockResolvedValue({ from: () => chain });
  mocks.list.mockResolvedValue([
    {
      membershipId: "membership-a",
      schoolId: a,
      schoolName: "A",
      isActive: true,
      allAppRoles: ["Professor"],
    },
    {
      membershipId: "membership-b",
      schoolId: b,
      schoolName: "B",
      isActive: true,
      allAppRoles: ["Aluno"],
    },
  ]);
  mocks.grant.mockResolvedValue(undefined);
});

describe("Mobile tenant and role authorization", () => {
  it("checks the exact requested school, user, active status and role", async () => {
    await requireMobileAcademicAccess("user", b, "aluno");
    expect(filters).toEqual({ user_id: "user", school_id: b, status: "active" });
    expect(mocks.list).toHaveBeenCalledWith(expect.anything(), "user", { strict: true });
    expect(mocks.grant).toHaveBeenCalledWith(b, "user", "pedagogica", "read");
  });
  it("does not borrow the professor role from the user's first school", async () => {
    await expect(requireMobileAcademicAccess("user", b, "professor")).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.grant).not.toHaveBeenCalled();
  });
  it("rejects revoked or missing membership", async () => {
    active.data = null;
    await expect(requireMobileAcademicAccess("user", b, "aluno")).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("fails closed when the direct membership lookup fails", async () => {
    active.error = { message: "timeout" };
    await expect(requireMobileAcademicAccess("user", b, "aluno")).rejects.toMatchObject({
      status: 503,
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects an inconsistent membership ID and inactive role source", async () => {
    mocks.list.mockResolvedValue([
      { membershipId: "other", schoolId: b, isActive: true, allAppRoles: ["Aluno"] },
    ]);
    await expect(requireMobileAcademicAccess("user", b, "aluno")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("honours module blocks and read-only grants for writes", async () => {
    mocks.grant.mockRejectedValue(new Error("Esta conta só tem leitura no módulo Pedagógica."));
    await expect(requireMobileAcademicAccess("user", b, "aluno", "write")).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.grant).toHaveBeenCalledWith(b, "user", "pedagogica", "write");
  });
  it("refuses invalid roles rather than treating them as aluno", async () => {
    await expect(requireMobileAcademicAccess("user", b, "admin" as never)).rejects.toThrow();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("does not advertise unavailable write capabilities", async () => {
    const memberships = mapMobileMemberships(await mocks.list());
    expect(memberships.map((m) => m.permissions)).toEqual([["academic.read"], ["academic.read"]]);
  });
  it("keeps institutional commands unavailable after valid authorization", async () => {
    await expect(
      applyMobileV4Command("user", {
        schoolId: b,
        role: "aluno",
        requestId: a,
        command: { type: "message", to: "teacher", text: "Hello" },
      }),
    ).rejects.toMatchObject({ status: 503, code: "COMMANDS_NOT_READY" });
  });
  it("rejects teacher-only commands under aluno role before access checks", async () => {
    await expect(
      applyMobileV4Command("user", {
        schoolId: b,
        role: "aluno",
        requestId: a,
        command: { type: "plan", lessonId: "lesson", objectives: "Read", materials: "" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
