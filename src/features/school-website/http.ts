/** Stable public HTTP boundary for school-owned websites. No privileged data DTO. */
export type PublicWebsiteForm = {
  slug: string;
  title?: string | null;
  subtitle?: string | null;
  hero_text?: string | null;
  is_open: boolean;
  school_name: string;
  school_phone?: string | null;
  school_email?: string | null;
  programs: { id: string; name: string }[];
};

type Dependencies = {
  getForm: (slug: string) => Promise<PublicWebsiteForm>;
  parseApplication: (body: unknown) => unknown;
  submit: (body: unknown) => Promise<{ ok: boolean; processNumber: string }>;
  origins: () => string | undefined;
  consumeSubmission: (request: Request) => Promise<boolean>;
};

const MAX_BODY_BYTES = 16_384;
const SLUG = /^[a-z0-9-]{2,80}$/;

function exactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      url.origin === value &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

export function websiteOrigins(raw: string | undefined, slug: string): string[] {
  try {
    const config = JSON.parse(raw ?? "{}");
    const values = config && typeof config === "object" ? config[slug] : null;
    return Array.isArray(values)
      ? [...new Set(values.filter((x): x is string => typeof x === "string" && exactOrigin(x)))]
      : [];
  } catch {
    return [];
  }
}

function response(request: Request, origin: string | null, status: number, body?: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  if (status === 429) headers.set("Retry-After", "3600");
  if (body !== undefined) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

async function boundedJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new RangeError("body");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("body");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Reuses enrollment validation, school state, rate limiting and official numbering. */
export function createSchoolWebsiteHandler(deps: Dependencies) {
  return async (request: Request, slug: string): Promise<Response> => {
    const origin = request.headers.get("origin");
    const permitted =
      origin !== null &&
      (origin === new URL(request.url).origin ||
        websiteOrigins(deps.origins(), slug).includes(origin));
    const reply = (status: number, body?: unknown) =>
      response(request, permitted ? origin : null, status, body);

    if (!SLUG.test(slug)) return reply(400, { error: "invalid_campaign" });
    if (origin && !permitted) return reply(403, { error: "origin_not_allowed" });
    if (request.method === "OPTIONS") {
      return permitted ? reply(204) : reply(403, { error: "origin_not_allowed" });
    }
    if (!["GET", "POST"].includes(request.method)) {
      return reply(405, { error: "method_not_allowed" });
    }
    if (request.method === "POST" && !permitted) {
      return reply(403, { error: "origin_required" });
    }

    let application: unknown;
    if (request.method === "POST") {
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
        return reply(415, { error: "json_required" });
      }
      let body: unknown;
      try {
        body = await boundedJson(request);
      } catch (error) {
        return reply(error instanceof RangeError ? 413 : 400, { error: "invalid_body" });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return reply(400, { error: "invalid_body" });
      }
      // The URL owns campaign scope. No client-supplied school or tenant identifier.
      const raw = body as Record<string, unknown>;
      if (
        (raw.slug !== undefined && raw.slug !== slug) ||
        "school_id" in raw ||
        "schoolId" in raw ||
        "tenant_id" in raw ||
        "tenantId" in raw
      ) {
        return reply(400, { error: "scope_mismatch" });
      }
      try {
        application = deps.parseApplication({ ...raw, slug });
      } catch {
        return reply(422, { error: "invalid_application" });
      }
    }

    let form: PublicWebsiteForm;
    try {
      form = await deps.getForm(slug);
    } catch {
      return reply(503, { error: "campaign_unavailable" });
    }
    if (!form.is_open || form.slug !== slug) return reply(404, { error: "campaign_unavailable" });

    if (request.method === "GET") {
      return reply(200, {
        apiVersion: 1,
        school: {
          name: form.school_name,
          phone: form.school_phone ?? null,
          email: form.school_email ?? null,
        },
        campaign: {
          slug: form.slug,
          title: form.title ?? null,
          subtitle: form.subtitle ?? null,
          description: form.hero_text ?? null,
          isOpen: true,
        },
        programs: form.programs.map(({ id, name }) => ({ id, name })),
      });
    }

    const programId = (application as { desiredProgramId?: string })?.desiredProgramId;
    if (programId && !form.programs.some((p) => p.id === programId)) {
      return reply(422, { error: "program_unavailable" });
    }
    // Raw file-route handlers do not rely on server-function IP context alone.
    try {
      if (!(await deps.consumeSubmission(request))) {
        return reply(429, { error: "rate_limited" });
      }
    } catch {
      return reply(503, { error: "submission_unavailable" });
    }
    try {
      const result = await deps.submit(application);
      if (!result.ok || !/^CAND-\d{8}-[A-F0-9]{6}$/.test(result.processNumber)) {
        return reply(502, { error: "invalid_upstream_response" });
      }
      return reply(201, { ok: true, processNumber: result.processNumber });
    } catch (error) {
      // Do not expose database, authentication or applicant details in HTTP errors.
      const rateLimited =
        error instanceof Error && error.message.startsWith("Demasiadas candidaturas");
      return reply(rateLimited ? 429 : 503, {
        error: rateLimited ? "rate_limited" : "submission_unavailable",
      });
    }
  };
}
