import { describe, expect, it, vi } from "vitest";
import { createSchoolWebsiteHandler, websiteOrigins } from "@/features/school-website/http";
import { submitPublicEnrollmentInputSchema } from "@/features/enrollment/schemas";
import { isPublicAppPath } from "@/lib/public-paths";

const program = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const origin = "https://school-a.example";
const slug = "school-a-campaign";
function setup() {
  const getForm = vi.fn(async () => ({
    slug,
    is_open: true,
    school_name: "School A",
    school_email: null,
    programs: [{ id: program, name: "Course A" }],
    school_id: "private-school-id",
    secret: "must-not-escape",
  }));
  const submit = vi.fn(async (_: unknown) => ({ ok: true, processNumber: "CAND-20261020-ABC123" }));
  const consumeSubmission = vi.fn(async (_: Request) => true);
  const handle = createSchoolWebsiteHandler({
    consumeSubmission,
    getForm,
    submit,
    parseApplication: (body) => submitPublicEnrollmentInputSchema.parse(body),
    origins: () =>
      JSON.stringify({ [slug]: [origin], "school-b-campaign": ["https://school-b.example"] }),
  });
  function request(method = "GET", body?: unknown, from: string | null = origin, extra = {}) {
    return new Request("https://api.example/api/public/school-website/" + slug, {
      method,
      headers: {
        ...(from ? { Origin: from } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  return { handle, request, getForm, submit, consumeSubmission };
}
const application = { person: { full_name: "Ana Example" }, desiredProgramId: program };

describe("school-owned website API", () => {
  it("exposes only public projection and no privileged identifiers", async () => {
    const { handle, request } = setup();
    const response = await handle(request(), slug);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.school.name).toBe("School A");
    expect(data.programs).toEqual([{ id: program, name: "Course A" }]);
    expect(JSON.stringify(data)).not.toMatch(/private-school|secret|school_id/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });
  it("rejects another school's origin before reading or writing", async () => {
    const { handle, request, getForm, submit } = setup();
    expect(
      (await handle(request("POST", application, "https://school-b.example"), slug)).status,
    ).toBe(403);
    expect(getForm).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it("never matches an origin by prefix", async () => {
    const { handle, request } = setup();
    expect((await handle(request("GET", undefined, origin + ".evil.example"), slug)).status).toBe(
      403,
    );
  });
  it("allows public server GET but rejects originless writes", async () => {
    const { handle, request } = setup();
    expect((await handle(request("GET", undefined, null), slug)).status).toBe(200);
    expect((await handle(request("POST", application, null), slug)).status).toBe(403);
  });
  it("allows preflight only for the campaign's origin", async () => {
    const { handle, request } = setup();
    const good = await handle(request("OPTIONS"), slug);
    expect(good.status).toBe(204);
    expect(good.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect((await handle(request("OPTIONS", undefined, "null"), slug)).status).toBe(403);
  });
  it("delegates validated writes and returns official numbering", async () => {
    const { handle, request, submit } = setup();
    const response = await handle(request("POST", application), slug);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, processNumber: "CAND-20261020-ABC123" });
    expect(submit).toHaveBeenCalledWith({ ...application, slug });
  });
  it("rejects a different campaign or supplied school/tenant IDs", async () => {
    for (const extra of [
      { slug: "other" },
      { school_id: other },
      { tenant_id: other },
      { schoolId: other },
      { tenantId: other },
    ]) {
      const { handle, request, submit } = setup();
      expect((await handle(request("POST", { ...application, ...extra }), slug)).status).toBe(400);
      expect(submit).not.toHaveBeenCalled();
    }
  });
  it("rejects another school's course even when the UUID is valid", async () => {
    const { handle, request, submit } = setup();
    const response = await handle(
      request("POST", { ...application, desiredProgramId: other }),
      slug,
    );
    expect(response.status).toBe(422);
    expect(submit).not.toHaveBeenCalled();
  });
  it("does not submit when a campaign closes or resolves to another school", async () => {
    const { handle, request, getForm, submit } = setup();
    const form = await getForm();
    getForm.mockResolvedValue({ ...form, is_open: false });
    expect((await handle(request("POST", application), slug)).status).toBe(404);
    getForm.mockResolvedValue({ ...form, slug: "another-school" });
    expect((await handle(request("POST", application), slug)).status).toBe(404);
    expect(submit).not.toHaveBeenCalled();
  });
  it("hides failures from the enrollment database and fails closed", async () => {
    const { handle, request, getForm, submit } = setup();
    getForm.mockRejectedValue(Error("sensitive database detail"));
    const response = await handle(request("POST", application), slug);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive");
    expect(submit).not.toHaveBeenCalled();
  });
  it("applies the raw-request limiter before submission and fails closed on limiter outage", async () => {
    const { handle, request, consumeSubmission, submit } = setup();
    consumeSubmission.mockResolvedValue(false);
    expect((await handle(request("POST", application), slug)).status).toBe(429);
    expect(submit).not.toHaveBeenCalled();
    consumeSubmission.mockRejectedValue(Error("limiter unavailable"));
    expect((await handle(request("POST", application), slug)).status).toBe(503);
    expect(submit).not.toHaveBeenCalled();
  });

  it("preserves rate-limited errors with a retry hint", async () => {
    const { handle, request, submit } = setup();
    submit.mockRejectedValue(Error("Demasiadas candidaturas a partir desta ligação."));
    const response = await handle(request("POST", application), slug);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3600");
  });
  it("does not present a fake process number as success", async () => {
    const { handle, request, submit } = setup();
    submit.mockResolvedValue({ ok: true, processNumber: "DEMO-EXAMPLE" });
    expect((await handle(request("POST", application), slug)).status).toBe(502);
  });
  it("validates input without calling data services", async () => {
    const { handle, request, getForm, submit } = setup();
    expect((await handle(request("POST", { person: { full_name: "A" } }), slug)).status).toBe(422);
    expect(getForm).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it("bounds request bytes and rejects non-JSON or malformed content", async () => {
    const { handle, request, submit } = setup();
    expect((await handle(request("POST", { huge: "a".repeat(17000) }), slug)).status).toBe(413);
    expect(
      (await handle(request("POST", application, origin, { "Content-Type": "text/plain" }), slug))
        .status,
    ).toBe(415);
    const broken = new Request("https://api.example", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{",
    });
    expect((await handle(broken, slug)).status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });
  it("does not expose all of api/public through the authentication gate", () => {
    expect(isPublicAppPath("/api/public/school-website/" + slug)).toBe(true);
    expect(isPublicAppPath("/api/public/unknown-private-resource")).toBe(false);
  });
  it("rejects wildcard, credentials, paths, insecure origins and malformed config", () => {
    expect(
      websiteOrigins(
        JSON.stringify({
          [slug]: [
            "*",
            "http://remote.example",
            origin + "/path",
            "https://user:password@school-a.example",
            origin,
            "http://localhost:4174",
          ],
        }),
        slug,
      ),
    ).toEqual([origin, "http://localhost:4174"]);
    expect(websiteOrigins("{", slug)).toEqual([]);
    expect(websiteOrigins(undefined, slug)).toEqual([]);
    expect(websiteOrigins(JSON.stringify({ other: [origin] }), slug)).toEqual([]);
  });
});
