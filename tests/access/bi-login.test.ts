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

  it("a captcha do projecto não se disfarça de senha errada", async () => {
    vi.stubEnv("SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_teste");
    // A resposta real do projecto enquanto `security_captcha_enabled` esteve ligado.
    const resposta = await passwordGrant("p@e.ao", "x", (async () =>
      jsonResponse(400, {
        error_code: "captcha_failed",
        msg: "captcha protection: request disallowed (no captcha_token found)",
      })) as typeof fetch);
    expect(resposta).toEqual({ ok: false, error: "captcha_failed" });
  });

  it("recusa desconhecida não acusa a senha do utilizador", async () => {
    vi.stubEnv("SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_teste");
    const grant = (status: number, body: unknown) =>
      passwordGrant("p@e.ao", "x", (async () => jsonResponse(status, body)) as typeof fetch);
    for (const body of [
      { error_code: "user_banned" },
      { error_code: "signup_disabled" },
      { error_code: "codigo_que_ainda_nao_existe" },
      {},
    ]) {
      expect(await grant(400, body)).toEqual({ ok: false, error: "unavailable" });
    }
  });

  it("o sinal da captcha segue no corpo, no sítio que o GoTrue lê", async () => {
    vi.stubEnv("SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_teste");
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { access_token: "a", refresh_token: "r" }),
    );
    await passwordGrant("p@e.ao", "x", fetchImpl as unknown as typeof fetch, "sinal-123");
    const corpo = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(corpo.gotrue_meta_security).toEqual({ captcha_token: "sinal-123" });
  });

  it("sem sinal, o corpo não leva o campo — para quando a protecção estiver desligada", async () => {
    vi.stubEnv("SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_teste");
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { access_token: "a", refresh_token: "r" }),
    );
    await passwordGrant("p@e.ao", "x", fetchImpl as unknown as typeof fetch);
    const corpo = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(corpo).not.toHaveProperty("gotrue_meta_security");
  });

  it("nenhuma função pública devolve o e-mail associado a um B.I.", () => {
    const server = readFileSync(join(process.cwd(), "src/features/access/server.ts"), "utf8");
    expect(server).not.toMatch(/resolveBiToEmailFn/);
    expect(server).not.toMatch(/return \{ email: resolvedEmail \}/);
  });
});
