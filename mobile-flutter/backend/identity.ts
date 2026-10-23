/** Isolated backend extension: institutional sign-in by B.I./phone/e-mail.
 *
 * Mirrors the guarantees of signInWithIdentifierFn in
 * src/features/access/server.ts: the resolved e-mail never leaves the server,
 * an unknown identifier and a wrong password give the same answer, and the
 * rate limit is charged per IP and per identifier. The project has hCaptcha
 * enabled, so a request without a signal is refused by Auth before the
 * password is read — the refusal is reported as such, never as bad credentials.
 *
 * This handler is not mounted on the published Worker until integration checks.
 */
export type GrantFailure =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "captcha_failed"
  | "unavailable";
export type GrantResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; error: GrantFailure };
export type IdentityDependencies = {
  /** Server-side resolver; its result must not reach the device. */
  resolveEmail: (identifier: string) => Promise<string>;
  passwordGrant: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<GrantResult>;
  /** Shared across instances; false means the caller spent its allowance. */
  consumeRateLimit: (key: string) => Promise<boolean>;
  clientIp: (request: Request) => string;
};

const FIELDS = new Set(["identifier", "password", "captchaToken"]);

function response(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: {
      // Tokens must never be stored by a proxy or the browser cache.
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...extra,
    },
  });
}

/** The same answer for an unknown identifier and for a wrong password: no
 * account enumeration, whichever side failed. */
const INVALID = () => response({ error: "INVALID_CREDENTIALS" }, 401);

const refusal: Record<GrantFailure, () => Response> = {
  invalid_credentials: INVALID,
  // Distinct from bad credentials on purpose: the client must show the signal
  // again instead of blaming the password.
  captcha_failed: () => response({ error: "CAPTCHA_REQUIRED" }, 401),
  email_not_confirmed: () => response({ error: "EMAIL_NOT_CONFIRMED" }, 403),
  rate_limited: () => response({ error: "RATE_LIMITED" }, 429),
  unavailable: () => response({ error: "SERVICE_UNAVAILABLE" }, 503),
};

export async function handleIdentitySignIn(
  request: Request,
  deps: IdentityDependencies,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname !== "/api/mobile-v4/auth/identifier") {
      return response({ error: "NOT_FOUND" }, 404);
    }
    if (request.method !== "POST") {
      return response({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "POST" });
    }
    const origin = request.headers.get("Origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site"
    ) {
      return response({ error: "ORIGIN_FORBIDDEN" }, 403);
    }
    if (!/^application\/json\b/i.test(request.headers.get("Content-Type") ?? "")) {
      return response({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response({ error: "INVALID_INPUT" }, 422);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ error: "INVALID_INPUT" }, 422);
    }
    const input = body as Record<string, unknown>;
    // An unexpected field is a different client, not a longer request: refuse
    // rather than silently ignore what the caller believes it sent.
    if (Object.keys(input).some((key) => !FIELDS.has(key))) {
      return response({ error: "UNKNOWN_INPUT_FIELD" }, 422);
    }
    const identifier =
      typeof input.identifier === "string" ? input.identifier.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    const captchaToken =
      input.captchaToken === undefined || input.captchaToken === null
        ? undefined
        : typeof input.captchaToken === "string"
          ? input.captchaToken
          : null;
    if (
      identifier.length < 3 ||
      identifier.length > 100 ||
      password.length < 1 ||
      password.length > 200 ||
      captchaToken === null ||
      (captchaToken !== undefined &&
        (captchaToken.length < 1 || captchaToken.length > 4000))
    ) {
      return response({ error: "INVALID_INPUT" }, 422);
    }
    // Per IP and, separately, per account: many addresses must not buy
    // unlimited password attempts against one person.
    const ip = deps.clientIp(request) || "unknown";
    const addressOk = await deps.consumeRateLimit(`bi_lookup:${ip}`);
    const accountOk =
      addressOk &&
      (await deps.consumeRateLimit(`bi_login_identifier:${identifier.toLowerCase()}`));
    if (!addressOk || !accountOk) {
      return response({ error: "RATE_LIMITED" }, 429);
    }
    const email = await deps.resolveEmail(identifier);
    if (typeof email !== "string" || !email.includes("@")) return INVALID();
    const grant = await deps.passwordGrant(email, password, captchaToken);
    if (!grant || typeof grant !== "object") {
      return response({ error: "SERVICE_UNAVAILABLE" }, 503);
    }
    if (!grant.ok) return (refusal[grant.error] ?? refusal.unavailable)();
    if (
      typeof grant.accessToken !== "string" ||
      !grant.accessToken ||
      typeof grant.refreshToken !== "string" ||
      !grant.refreshToken
    ) {
      return response({ error: "SERVICE_UNAVAILABLE" }, 503);
    }
    // Allowlist: the session and nothing else. No resolved e-mail, no user id,
    // no membership — those come from the session endpoints already audited.
    return response({
      version: 1,
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
    });
  } catch {
    // No identifier, password or Auth message in the log or the body.
    return response({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
