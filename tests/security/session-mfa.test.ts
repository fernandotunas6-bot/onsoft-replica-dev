import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_MFA_REQUIRED,
  accessTokenAal,
  assertSessionMfa,
  clearSessionMfaCache,
  isSessionMfaError,
} from "@/integrations/supabase/session-mfa";

function token(payload: Record<string, unknown>) {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("2FA imposto na sessão", () => {
  beforeEach(() => clearSessionMfaCache());

  it("lê o aal do token", () => {
    expect(accessTokenAal(token({ sub: "u", aal: "aal2" }))).toBe("aal2");
    expect(accessTokenAal(token({ sub: "u", aal: "aal1" }))).toBe("aal1");
    expect(accessTokenAal("lixo")).toBeNull();
  });

  it("aal2 passa sem consultar factores", async () => {
    const lookup = vi.fn(async () => true);
    await expect(assertSessionMfa("u1", "aal2", lookup)).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("aal1 de conta SEM 2FA passa", async () => {
    await expect(assertSessionMfa("u1", "aal1", async () => false)).resolves.toBeUndefined();
  });

  it("aal1 de conta COM 2FA é recusado com 401", async () => {
    const error = await assertSessionMfa("u1", "aal1", async () => true).catch((e: unknown) => e);
    expect((error as Error).message).toBe(SESSION_MFA_REQUIRED);
    expect((error as { statusCode?: number }).statusCode).toBe(401);
    expect(isSessionMfaError(error)).toBe(true);
  });

  it("sem conseguir consultar os factores, aal1 não passa", async () => {
    const lookup = async () => {
      throw new Error("rede");
    };
    await expect(assertSessionMfa("u1", "aal1", lookup)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("guarda o resultado 60 s por utilizador", async () => {
    const lookup = vi.fn(async () => false);
    await assertSessionMfa("u1", "aal1", lookup, 1_000);
    await assertSessionMfa("u1", "aal1", lookup, 30_000);
    expect(lookup).toHaveBeenCalledTimes(1);
    await assertSessionMfa("u1", "aal1", lookup, 62_000);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("o middleware e a API SaaS aplicam a regra", () => {
    const middleware = readFileSync(
      join(process.cwd(), "src/integrations/supabase/auth-middleware.ts"),
      "utf8",
    );
    expect(middleware.match(/await assertSessionMfa\(/g)).toHaveLength(3);
    expect(middleware.match(/isSessionMfaError\(/g)).toHaveLength(2);
    const guard = readFileSync(join(process.cwd(), "src/features/saas/platform-guard.ts"), "utf8");
    expect(guard).toMatch(/await assertSessionMfa\(data\.user\.id, aal\)/);
  });

  it("o ecrã de entrada pede o código em qualquer via de entrada", () => {
    const gate = readFileSync(join(process.cwd(), "src/components/auth/AuthGate.tsx"), "utf8");
    expect(gate).toMatch(/await adoptSession\(data\.session\)/);
    expect(gate).toMatch(/adoptSession\(nextSession\)/);
  });
});
