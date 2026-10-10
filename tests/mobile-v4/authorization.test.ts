import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  list: vi.fn(),
  grant: vi.fn(),
  scope: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: mocks.load,
  assertModuleNotBlocked: mocks.grant,
}));
vi.mock("@/integrations/supabase/sga", () => ({ listUserSchoolMemberships: mocks.list }));
vi.mock("@/features/mobile-v4/academic-scope.server", () => ({
  resolveMobileAcademicScope: mocks.scope,
}));
vi.mock("@/features/mobile-v4/academic-catalog.server", () => ({
  readMobileAcademicCatalog: mocks.catalog,
}));

import { requireMobileAcademicAccess } from "@/features/mobile-v4/authorization";
import {
  applyMobileV4Command,
  loadMobileV4Workspace,
  loadMobileV4AcademicCatalog,
} from "@/features/mobile-v4/operations-core.server";
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
  mocks.scope.mockResolvedValue({ classSubjectIds: [], enrollmentIds: [] });
  mocks.catalog.mockResolvedValue({
    schoolId: b,
    role: "aluno",
    classes: [],
    timetable: [],
    tasks: [],
  });
});

describe("Mobile tenant and role authorization", () => {
  it("loads the catalog only after membership and academic scope resolution", async () => {
    const data = await loadMobileV4AcademicCatalog("user", { schoolId: b, role: "aluno" });
    expect(data.schoolId).toBe(b);
    expect(mocks.catalog).toHaveBeenCalledWith(
      expect.anything(),
      { classSubjectIds: [], enrollmentIds: [] },
      "user",
    );
    expect(mocks.grant.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.scope.mock.invocationCallOrder[0],
    );
    expect(mocks.scope.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.catalog.mock.invocationCallOrder[0],
    );
  });
  it("never reads catalog records after a forbidden or revoked school membership", async () => {
    active.data = null;
    await expect(
      loadMobileV4AcademicCatalog("user", { schoolId: b, role: "aluno" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("resolves academic scope only after exact school and role authorization", async () => {
    await expect(
      loadMobileV4Workspace("user", { schoolId: b, role: "aluno" }),
    ).rejects.toMatchObject({
      status: 503,
      code: "WORKSPACE_NOT_READY",
    });
    expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), "user", b, "aluno");
    expect(mocks.grant.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.scope.mock.invocationCallOrder[0],
    );
  });
  it("does not resolve academic records for a forbidden school", async () => {
    active.data = null;
    await expect(
      loadMobileV4Workspace("user", { schoolId: b, role: "aluno" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.scope).not.toHaveBeenCalled();
  });
  it("preserves identity denial from the academic resolver", async () => {
    const { MobileApiError } = await import("@/features/mobile-v4/errors");
    mocks.scope.mockRejectedValueOnce(new MobileApiError(403, "ACADEMIC_IDENTITY_REQUIRED"));
    await expect(
      loadMobileV4Workspace("user", { schoolId: b, role: "aluno" }),
    ).rejects.toMatchObject({
      status: 403,
      code: "ACADEMIC_IDENTITY_REQUIRED",
    });
  });
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
  it("advertises only the writes the server implements (attendance call and scores)", async () => {
    const memberships = mapMobileMemberships(await mocks.list());
    expect(memberships.map((m) => m.permissions)).toEqual([
      ["academic.read", "attendance.write", "grades.write"],
      ["academic.read"],
    ]);
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
