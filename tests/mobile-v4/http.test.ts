import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/saas/platform-guard", () => ({ resolveBearerSession: vi.fn() }));
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: vi.fn() }));
vi.mock("@/features/mobile-v4/session-core.server", () => ({ loadMobileV4Session: vi.fn() }));
vi.mock("@/features/mobile-v4/operations-core.server", () => ({
  loadMobileV4Workspace: vi.fn(),
  loadMobileV4AcademicCatalog: vi.fn(),
  loadMobileV4Attendance: vi.fn(),
  loadMobileV4Results: vi.fn(),
  applyMobileV4Command: vi.fn(),
}));

import { handleMobileV4Http, type MobileHttpDependencies } from "@/features/mobile-v4/http.server";
import { MobileApiError } from "@/features/mobile-v4/errors";

const school = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const command = {
  role: "professor",
  requestId,
  command: {
    type: "grade",
    classId: "class",
    studentId: "student",
    value: 12,
    published: false,
    expectedRevision: 0,
  },
};
let deps: MobileHttpDependencies;
function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://staging.example/api/mobile-v4" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  deps = {
    authenticate: vi.fn().mockResolvedValue({ userId: "verified-user", aal: "aal2" }),
    session: vi.fn().mockResolvedValue({ userId: "verified-user" }),
    workspace: vi.fn().mockResolvedValue({ schoolId: school }),
    results: vi.fn().mockResolvedValue({ schoolId: school, role: "aluno", sheets: [] }),
    attendance: vi.fn().mockResolvedValue({ sessions: [], teacherLessons: [] }),
    academic: vi.fn().mockResolvedValue({
      schoolId: school,
      role: "aluno",
      classes: [],
      timetable: [],
      tasks: [],
    }),
    command: vi.fn().mockResolvedValue({ committed: true }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Mobile V4 HTTP transport with controlled service dependencies", () => {
  it("serves the canonical catalog only for the verified user and exact school/role", async () => {
    const response = await handleMobileV4Http(
      request(`/schools/${school}/academic?role=aluno&userId=attacker`),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.academic).toHaveBeenCalledWith("verified-user", {
      schoolId: school,
      role: "aluno",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(deps.workspace).not.toHaveBeenCalled();
    expect(deps.command).not.toHaveBeenCalled();
  });
  it("rejects invalid catalog scope before data lookup", async () => {
    for (const path of [
      `/schools/${school}/academic?role=admin`,
      `/schools/${school}/academic`,
      "/schools/abc/academic?role=aluno",
    ]) {
      expect((await handleMobileV4Http(request(path), deps)).status).toBe(422);
    }
    expect(deps.academic).not.toHaveBeenCalled();
  });
  it("does not read the catalog with an invalid session or cross-site origin", async () => {
    vi.mocked(deps.authenticate).mockRejectedValueOnce(new Error("invalid token"));
    expect(
      (await handleMobileV4Http(request(`/schools/${school}/academic?role=aluno`), deps)).status,
    ).toBe(401);
    expect(
      (
        await handleMobileV4Http(
          request(`/schools/${school}/academic?role=aluno`, undefined, {
            Origin: "https://evil.example",
          }),
          deps,
        )
      ).status,
    ).toBe(403);
    expect(deps.academic).not.toHaveBeenCalled();
  });
  it("returns catalog lookup failure without exposing database details", async () => {
    vi.mocked(deps.academic).mockRejectedValueOnce(
      new MobileApiError(503, "ACADEMIC_CATALOG_UNAVAILABLE"),
    );
    const response = await handleMobileV4Http(
      request(`/schools/${school}/academic?role=aluno`),
      deps,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ACADEMIC_CATALOG_UNAVAILABLE" });
  });
  it("returns private JSON from the verified identity", async () => {
    const response = await handleMobileV4Http(request("/session"), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(deps.session).toHaveBeenCalledWith("verified-user");
    expect(deps.authenticate).toHaveBeenCalledWith("Bearer test-jwt");
  });
  it("rejects invalid or MFA-pending sessions without reading data", async () => {
    vi.mocked(deps.authenticate).mockRejectedValue(new Error("secret JWT details"));
    const response = await handleMobileV4Http(request("/session"), deps);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("secret");
    expect(deps.session).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and opaque-origin requests before auth", async () => {
    for (const origin of ["https://evil.example", "null"]) {
      expect(
        (await handleMobileV4Http(request("/logout", {}, { Origin: origin }), deps)).status,
      ).toBe(403);
    }
    expect(deps.authenticate).not.toHaveBeenCalled();
  });
  it("does not support CORS preflight or incorrect methods", async () => {
    const response = await handleMobileV4Http(
      new Request("https://staging.example/api/mobile-v4/session", { method: "OPTIONS" }),
      deps,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(deps.authenticate).not.toHaveBeenCalled();
  });
  it("validates school UUID and role before querying workspace", async () => {
    for (const path of [
      `/schools/${school}/workspace?role=admin`,
      "/schools/abc/workspace?role=aluno",
    ]) {
      expect((await handleMobileV4Http(request(path), deps)).status).toBe(422);
    }
    expect(deps.workspace).not.toHaveBeenCalled();
  });
  it("forwards only route school and verified user", async () => {
    await handleMobileV4Http(
      request(`/schools/${school}/workspace?role=aluno&userId=attacker`),
      deps,
    );
    expect(deps.workspace).toHaveBeenCalledWith("verified-user", {
      schoolId: school,
      role: "aluno",
    });
  });
  it("requires aal2 for every write", async () => {
    vi.mocked(deps.authenticate).mockResolvedValue({ userId: "verified-user", aal: "aal1" });
    expect(
      (await handleMobileV4Http(request(`/schools/${school}/commands`, command), deps)).status,
    ).toBe(403);
    expect(deps.command).not.toHaveBeenCalled();
  });
  it("rejects forged identity/tenant and unknown fields", async () => {
    for (const extra of [{ userId: "attacker" }, { schoolId: school }, { unsafe: true }]) {
      expect(
        (
          await handleMobileV4Http(
            request(`/schools/${school}/commands`, { ...command, ...extra }),
            deps,
          )
        ).status,
      ).toBe(422);
    }
    expect(deps.command).not.toHaveBeenCalled();
  });
  it("validates payload before dispatch and preserves idempotency key", async () => {
    const response = await handleMobileV4Http(
      request(`/schools/${school}/commands`, command),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.command).toHaveBeenCalledWith("verified-user", { ...command, schoolId: school });
  });
  it("returns 403/409/503 without leaking details or reporting success", async () => {
    for (const status of [403, 409, 503]) {
      vi.mocked(deps.command).mockRejectedValue(new MobileApiError(status, "OPERATION_BLOCKED"));
      expect(
        (await handleMobileV4Http(request(`/schools/${school}/commands`, command), deps)).status,
      ).toBe(status);
    }
  });
  it("rejects malformed JSON and unsupported content types", async () => {
    const malformed = new Request(
      `https://staging.example/api/mobile-v4/schools/${school}/commands`,
      {
        method: "POST",
        body: "{",
        headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      },
    );
    expect((await handleMobileV4Http(malformed, deps)).status).toBe(422);
    expect(
      (
        await handleMobileV4Http(
          request(`/schools/${school}/commands`, command, { "Content-Type": "text/plain" }),
          deps,
        )
      ).status,
    ).toBe(415);
    expect(deps.command).not.toHaveBeenCalled();
  });
  it("limits streamed bodies even without content-length", async () => {
    const response = await handleMobileV4Http(
      request(`/schools/${school}/commands`, { text: "x".repeat(70000) }),
      deps,
    );
    expect(response.status).toBe(413);
    expect(deps.command).not.toHaveBeenCalled();
  });
  it("revokes only the current refresh session on logout", async () => {
    expect((await handleMobileV4Http(request("/logout", {}), deps)).status).toBe(204);
    expect(deps.logout).toHaveBeenCalledWith("test-jwt");
  });
  it("fails logout if revocation is unavailable", async () => {
    vi.mocked(deps.logout).mockRejectedValue(new MobileApiError(503, "LOGOUT_UNAVAILABLE"));
    expect((await handleMobileV4Http(request("/logout", {}), deps)).status).toBe(503);
  });
});

describe("attendance HTTP scope", () => {
  it("uses verified identity and server-validated bounded period", async () => {
    const r = await handleMobileV4Http(
      request(
        `/schools/${school}/attendance?role=aluno&from=2026-10-01&to=2026-10-31&studentId=other`,
      ),
      deps,
    );
    expect(r.status).toBe(200);
    expect(deps.attendance).toHaveBeenCalledWith("verified-user", {
      schoolId: school,
      role: "aluno",
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });
  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026-10-31", "2026-10-01"],
    ["2026-10-01", "2026-11-01"],
    ["", "2026-10-01"],
  ])("rejects invalid period %s to %s", async (from, to) => {
    const r = await handleMobileV4Http(
      request(`/schools/${school}/attendance?role=aluno&from=${from}&to=${to}`),
      deps,
    );
    expect(r.status).toBe(422);
    expect(deps.attendance).not.toHaveBeenCalled();
  });
});

it("routes published results with verified identity and exact school/role", async () => {
  const response = await handleMobileV4Http(
    request(`/schools/${school}/results?role=aluno&userId=attacker`),
    deps,
  );
  expect(response.status).toBe(200);
  expect(deps.results).toHaveBeenCalledWith("verified-user", { schoolId: school, role: "aluno" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects results before service invocation on invalid scope, missing auth and wrong method", async () => {
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/results?role=guardian`), deps)).status,
  ).toBe(422);
  deps.authenticate = vi.fn().mockRejectedValue(new Error("expired"));
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/results?role=aluno`), deps)).status,
  ).toBe(401);
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/results?role=aluno`, {}), deps)).status,
  ).toBe(405);
  expect(deps.results).not.toHaveBeenCalled();
});
