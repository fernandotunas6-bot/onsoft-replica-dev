import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/saas/platform-guard", () => ({ resolveBearerSession: vi.fn() }));
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: vi.fn() }));
vi.mock("@/features/mobile-v4/session-core.server", () => ({ loadMobileV4Session: vi.fn() }));
vi.mock("@/features/mobile-v4/operations-core.server", () => ({
  loadMobileV4Workspace: vi.fn(),
  loadMobileV4AcademicCatalog: vi.fn(),
  loadMobileV4Attendance: vi.fn(),
  loadMobileV4Results: vi.fn(),
  loadMobileV4Gradebooks: vi.fn(),
  loadMobileV4LessonPlans: vi.fn(),
  loadMobileV4Documents: vi.fn(),
  loadMobileV4Finance: vi.fn(),
  loadMobileV4Chat: vi.fn(),
  loadMobileV4ChatContacts: vi.fn(),
  loadMobileV4ChatAttachment: vi.fn(),
  applyMobileV4ChatCommand: vi.fn(),
  loadMobileV4ChatCapabilities: vi.fn(),
  loadMobileV4Notifications: vi.fn(),
  applyMobileV4NotificationsRead: vi.fn(),
  applyMobileV4AttendanceCall: vi.fn(),
  applyMobileV4SubmissionUpload: vi.fn(),
  applyMobileV4Submission: vi.fn(),
  loadMobileV4Submissions: vi.fn(),
  loadMobileV4SubmissionFile: vi.fn(),
  loadMobileV4Transport: vi.fn(),
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
    capabilities: vi.fn().mockResolvedValue({ writes: false }),
    contacts: vi.fn().mockResolvedValue({ contacts: [] }),
    attachment: vi.fn().mockResolvedValue({ url: "https://example.test" }),
    notifications: vi.fn().mockResolvedValue({ items: [], unread: 0 }),
    chat: vi.fn().mockResolvedValue({ threads: [] }),
    finance: vi.fn().mockResolvedValue({
      schoolId: school,
      userId: "verified-user",
      role: "aluno",
      invoices: [],
    }),
    gradebooks: vi.fn().mockResolvedValue({ schoolId: school, role: "professor", books: [] }),
    "lesson-plans": vi.fn().mockResolvedValue({ schoolId: school, role: "professor", plans: [] }),
    documents: vi.fn().mockResolvedValue({ schoolId: school, role: "aluno", requests: [] }),
    results: vi.fn().mockResolvedValue({ schoolId: school, role: "aluno", sheets: [] }),
    attendance: vi.fn().mockResolvedValue({ sessions: [], teacherLessons: [] }),
    submissionUpload: vi.fn().mockResolvedValue({ path: "p", uploadUrl: "https://u.test" }),
    submission: vi.fn().mockResolvedValue({ submission: { id: "s" } }),
    submissions: vi.fn().mockResolvedValue({ submissions: [] }),
    submissionFile: vi.fn().mockResolvedValue({ url: "https://f.test" }),
    transport: vi.fn().mockResolvedValue({ routes: [] }),
    academic: vi.fn().mockResolvedValue({
      schoolId: school,
      role: "aluno",
      classes: [],
      timetable: [],
      tasks: [],
    }),
    chatCommand: vi
      .fn()
      .mockResolvedValue({ type: "send", conversationId: school, messageId: requestId }),
    command: vi.fn().mockResolvedValue({ committed: true }),
    notificationsRead: vi.fn().mockResolvedValue({ updated: 1, unread: 0 }),
    attendanceCall: vi.fn().mockResolvedValue({ status: "completed" }),
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

it("routes internal gradebooks only after validating identity and scope", async () => {
  const response = await handleMobileV4Http(
    request(`/schools/${school}/gradebooks?role=professor&teacherId=attacker`),
    deps,
  );
  expect(response.status).toBe(200);
  expect(deps.gradebooks).toHaveBeenCalledWith("verified-user", {
    schoolId: school,
    role: "professor",
  });
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/gradebooks?role=other`), deps)).status,
  ).toBe(422);
});

it("routes lesson plans by GET only, with the scope from the route", async () => {
  const response = await handleMobileV4Http(
    request(`/schools/${school}/lesson-plans?role=professor&teacherId=attacker`),
    deps,
  );
  expect(response.status).toBe(200);
  expect(deps["lesson-plans"]).toHaveBeenCalledWith("verified-user", {
    schoolId: school,
    role: "professor",
  });
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/lesson-plans`, {}), deps)).status,
  ).toBe(405);
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/lesson-plans?role=other`), deps)).status,
  ).toBe(422);
});

it("routes the student's documents by GET only, with the scope from the route", async () => {
  const response = await handleMobileV4Http(
    request(`/schools/${school}/documents?role=aluno&studentId=attacker`),
    deps,
  );
  expect(response.status).toBe(200);
  expect(deps.documents).toHaveBeenCalledWith("verified-user", { schoolId: school, role: "aluno" });
  expect((await handleMobileV4Http(request(`/schools/${school}/documents`, {}), deps)).status).toBe(
    405,
  );
});

it("serves only the finance scope bound to verified identity", async () => {
  const response = await handleMobileV4Http(
    request(`/schools/${school}/finance?role=aluno&studentId=attacker`),
    deps,
  );
  expect(response.status).toBe(200);
  expect(deps.finance).toHaveBeenCalledWith("verified-user", { schoolId: school, role: "aluno" });
});

it("validates chat cursor and binds only verified actor / requested school", async () => {
  expect(
    (
      await handleMobileV4Http(
        request(
          `/schools/${school}/chat?role=aluno&conversationId=${school}&before=2026-10-10T08:00:00.123456Z&beforeId=${requestId}`,
        ),
        deps,
      )
    ).status,
  ).toBe(200);
  expect(deps.chat).toHaveBeenCalledWith(
    "verified-user",
    expect.objectContaining({ schoolId: school, conversationId: school, beforeId: requestId }),
  );
  expect(
    (
      await handleMobileV4Http(
        request(`/schools/${school}/chat?role=aluno&beforeId=${requestId}`),
        deps,
      )
    ).status,
  ).toBe(422);
});
it("requires MFA and strict body for all chat mutations", async () => {
  const data = {
    role: "aluno",
    requestId,
    command: { type: "send", conversationId: school, body: "Mensagem" },
  };
  vi.mocked(deps.authenticate).mockResolvedValueOnce({ userId: "verified-user", aal: "aal1" });
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/chat-commands`, data), deps)).status,
  ).toBe(403);
  expect(deps.chatCommand).not.toHaveBeenCalled();
  expect(
    (
      await handleMobileV4Http(
        request(`/schools/${school}/chat-commands`, { ...data, userId: "attacker" }),
        deps,
      )
    ).status,
  ).toBe(422);
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/chat-commands`, data), deps)).status,
  ).toBe(200);
  expect(deps.chatCommand).toHaveBeenCalledWith("verified-user", { ...data, schoolId: school });
});

it.each(["professor", "aluno"])(
  "routes notifications using verified identity for %s",
  async (role) => {
    const response = await handleMobileV4Http(
      request(`/schools/${school}/notifications?role=${role}`),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.notifications).toHaveBeenCalledWith("verified-user", { schoolId: school, role });
  },
);

it("forwards the notification cursor and refuses half a cursor", async () => {
  const before = "2026-10-10T08:00:00.123456+00:00";
  const beforeId = "33333333-3333-4333-8333-333333333333";
  const params = new URLSearchParams({ role: "aluno", before, beforeId });
  const ok = await handleMobileV4Http(request(`/schools/${school}/notifications?${params}`), deps);
  expect(ok.status).toBe(200);
  expect(deps.notifications).toHaveBeenCalledWith("verified-user", {
    schoolId: school,
    role: "aluno",
    before,
    beforeId,
  });
  const half = await handleMobileV4Http(
    request(`/schools/${school}/notifications?role=aluno&before=${encodeURIComponent(before)}`),
    deps,
  );
  expect(half.status).toBe(422);
});

it("marks notices read only by POST, with MFA, a strict body and the route school", async () => {
  const path = `/schools/${school}/notifications-read`;
  const ids = ["33333333-3333-4333-8333-333333333333"];
  expect((await handleMobileV4Http(request(path), deps)).status).toBe(405);
  deps.authenticate = vi.fn().mockResolvedValue({ userId: "verified-user", aal: "aal1" });
  expect((await handleMobileV4Http(request(path, { role: "aluno", ids }), deps)).status).toBe(403);
  deps.authenticate = vi.fn().mockResolvedValue({ userId: "verified-user", aal: "aal2" });
  for (const body of [
    { role: "aluno" },
    { role: "aluno", ids: [] },
    { role: "aluno", ids: [ids[0], ids[0]] },
    { role: "aluno", ids: ["not-a-uuid"] },
    { role: "aluno", ids, all: true },
    { role: "aluno", all: false },
    { role: "aluno", ids, schoolId: school },
    { role: "aluno", ids, userId: "attacker" },
  ])
    expect((await handleMobileV4Http(request(path, body), deps)).status, JSON.stringify(body)).toBe(
      422,
    );
  expect(deps.notificationsRead).not.toHaveBeenCalled();
  const response = await handleMobileV4Http(request(path, { role: "aluno", ids }), deps);
  expect(response.status).toBe(200);
  expect(deps.notificationsRead).toHaveBeenCalledWith("verified-user", {
    role: "aluno",
    ids,
    schoolId: school,
  });
  expect(
    (await handleMobileV4Http(request(path, { role: "professor", all: true }), deps)).status,
  ).toBe(200);
});

it("records a teacher call only by POST, with MFA, a strict body and the route school", async () => {
  const path = `/schools/${school}/attendance-call`;
  const student = "44444444-4444-4444-8444-444444444444";
  const cs = "55555555-5555-4555-8555-555555555555";
  const call = {
    role: "professor",
    classSubjectId: cs,
    date: "2026-10-09",
    records: [{ studentId: student, status: "absent" }],
  };
  expect((await handleMobileV4Http(request(path), deps)).status).toBe(405);
  deps.authenticate = vi.fn().mockResolvedValue({ userId: "verified-user", aal: "aal1" });
  expect((await handleMobileV4Http(request(path, call), deps)).status).toBe(403);
  deps.authenticate = vi.fn().mockResolvedValue({ userId: "verified-user", aal: "aal2" });
  for (const body of [
    { ...call, records: [] },
    { ...call, records: [call.records[0], call.records[0]] },
    { ...call, records: [{ studentId: student, status: "not_registered" }] },
    { ...call, records: [{ studentId: student, status: "absent", notes: "x" }] },
    { ...call, date: "2026-02-30" },
    { ...call, classSubjectId: "class" },
    { ...call, schoolId: school },
    { ...call, teacherId: "attacker" },
  ])
    expect((await handleMobileV4Http(request(path, body), deps)).status, JSON.stringify(body)).toBe(
      422,
    );
  expect(deps.attendanceCall).not.toHaveBeenCalled();
  const response = await handleMobileV4Http(request(path, call), deps);
  expect(response.status).toBe(200);
  expect(deps.attendanceCall).toHaveBeenCalledWith("verified-user", { ...call, schoolId: school });
});

it("PDF submissions: upload and register only by POST with MFA and strict bodies", async () => {
  const task = "66666666-6666-4666-8666-666666666666";
  const upload = { role: "aluno", taskId: task, fileName: "trabalho.pdf", sizeBytes: 2048 };
  const uploadPath = `/schools/${school}/submission-upload`;
  expect((await handleMobileV4Http(request(uploadPath), deps)).status).toBe(405);
  deps.authenticate = vi.fn().mockResolvedValue({ userId: "verified-user", aal: "aal1" });
  expect((await handleMobileV4Http(request(uploadPath, upload), deps)).status).toBe(403);
  deps.authenticate = vi.fn().mockResolvedValue({ userId: "verified-user", aal: "aal2" });
  for (const body of [
    { ...upload, sizeBytes: 10 * 1024 * 1024 + 1 },
    { ...upload, sizeBytes: 0 },
    { ...upload, taskId: "task" },
    { ...upload, schoolId: school },
    { ...upload, studentId: "attacker" },
  ])
    expect(
      (await handleMobileV4Http(request(uploadPath, body), deps)).status,
      JSON.stringify(body),
    ).toBe(422);
  expect(deps.submissionUpload).not.toHaveBeenCalled();
  expect((await handleMobileV4Http(request(uploadPath, upload), deps)).status).toBe(200);
  expect(deps.submissionUpload).toHaveBeenCalledWith("verified-user", {
    ...upload,
    schoolId: school,
  });

  const register = { role: "aluno", taskId: task, path: `${school}/2026/10/submissions/u/x.pdf` };
  const registerPath = `/schools/${school}/submission`;
  expect(
    (await handleMobileV4Http(request(registerPath, { ...register, extra: 1 }), deps)).status,
  ).toBe(422);
  expect((await handleMobileV4Http(request(registerPath, register), deps)).status).toBe(200);
  expect(deps.submission).toHaveBeenCalledWith("verified-user", { ...register, schoolId: school });
});

it("PDF submissions: list and open by GET with the route school", async () => {
  const task = "66666666-6666-4666-8666-666666666666";
  const sub = "77777777-7777-4777-8777-777777777777";
  const list = await handleMobileV4Http(
    request(`/schools/${school}/submissions?role=professor&taskId=${task}`),
    deps,
  );
  expect(list.status).toBe(200);
  expect(deps.submissions).toHaveBeenCalledWith("verified-user", {
    schoolId: school,
    role: "professor",
    taskId: task,
  });
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/submissions?role=aluno&taskId=x`), deps))
      .status,
  ).toBe(422);
  const file = await handleMobileV4Http(
    request(`/schools/${school}/submission-file?role=aluno&submissionId=${sub}`),
    deps,
  );
  expect(file.status).toBe(200);
  expect(deps.submissionFile).toHaveBeenCalledWith("verified-user", {
    schoolId: school,
    role: "aluno",
    submissionId: sub,
  });
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/submissions?role=aluno`, {}), deps))
      .status,
  ).toBe(405);
});

it("transport: only by GET, with the route school and a known role", async () => {
  const ok = await handleMobileV4Http(request(`/schools/${school}/transport?role=aluno`), deps);
  expect(ok.status).toBe(200);
  expect(deps.transport).toHaveBeenCalledWith("verified-user", { schoolId: school, role: "aluno" });
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/transport?role=director`), deps)).status,
  ).toBe(422);
  expect(
    (await handleMobileV4Http(request(`/schools/${school}/transport?role=aluno`, {}), deps)).status,
  ).toBe(405);
});
