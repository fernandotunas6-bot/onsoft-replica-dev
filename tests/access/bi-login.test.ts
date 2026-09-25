import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordGrant, signInWithIdentifierInputSchema } from "@/features/access/bi-login";
import { validateAngolaBi } from "@/lib/angola-identity";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("login por B.I.", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("valida identificador e senha", () => {
    const parsed = signInWithIdentifierInputSchema.parse({
      identifier: "004212984LA042",
      password: "segredo",
    });
    expect(parsed.identifier).toBe("004212984LA042");
    expect(() => signInWithIdentifierInputSchema.parse({ identifier: "004212984LA042" })).toThrow();
  });

  it("valida o formato do B.I. antes de consultar a base", () => {
    const validBi = validateAngolaBi("004212984LA042");
    expect(validBi.ok).toBe(true);
    expect(validBi.compact).toBe("004212984LA042");
    expect(validateAngolaBi("12345").ok).toBe(false);
  });

  it("devolve só os tokens da sessão, nunca o e-mail", async () => {
    vi.stubEnv("SUPABASE_URL", "https://exemplo.supabase.co/");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_teste");
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        access_token: "a",
        refresh_token: "r",
        user: { email: "pessoa@escola.ao" },
      }),
    );
    const result = await passwordGrant("pessoa@escola.ao", "certa", fetchImpl as typeof fetch);
    expect(result).toEqual({ ok: true, accessToken: "a", refreshToken: "r" });
    expect(JSON.stringify(result)).not.toContain("@");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://exemplo.supabase.co/auth/v1/token?grant_type=password",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("senha errada, e-mail por confirmar e limite dão códigos, sem a mensagem do Auth", async () => {
    vi.stubEnv("SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_teste");
    const grant = (status: number, body: unknown) =>
      passwordGrant("p@e.ao", "x", (async () => jsonResponse(status, body)) as typeof fetch);
    expect(await grant(400, { error_code: "invalid_credentials" })).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect(await grant(400, { error_code: "email_not_confirmed" })).toEqual({
      ok: false,
      error: "email_not_confirmed",
    });
    expect(await grant(429, {})).toEqual({ ok: false, error: "rate_limited" });
    expect(await grant(503, {})).toEqual({ ok: false, error: "unavailable" });
  });

  it("nenhuma função pública devolve o e-mail associado a um B.I.", () => {
    const server = readFileSync(join(process.cwd(), "src/features/access/server.ts"), "utf8");
    expect(server).not.toMatch(/resolveBiToEmailFn/);
    expect(server).not.toMatch(/return \{ email: resolvedEmail \}/);
  });
});
