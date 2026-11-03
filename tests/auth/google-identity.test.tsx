// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createGoogleIdentityNonce,
  isGoogleIdentityOriginAllowed,
} from "@/components/auth/GoogleIdentityButton";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

describe("login Google com identidade SIGA Plus", () => {
  it("usa apenas origens autorizadas, sem confiar em prefixos nem subdomínios inesperados", () => {
    const list = "https://portal-siga.com, https://ispab.portal-siga.com";
    expect(isGoogleIdentityOriginAllowed("https://portal-siga.com", list)).toBe(true);
    expect(isGoogleIdentityOriginAllowed("https://ispab.portal-siga.com", list)).toBe(true);
    expect(isGoogleIdentityOriginAllowed("https://outra.portal-siga.com", list)).toBe(false);
    expect(isGoogleIdentityOriginAllowed("https://portal-siga.com.evil.example", list)).toBe(false);
    expect(isGoogleIdentityOriginAllowed("http://portal-siga.com", "http://portal-siga.com")).toBe(false);
    expect(isGoogleIdentityOriginAllowed("https://portal-siga.com", "")).toBe(false);
  });

  it("gera nonce aleatório e entrega ao Google somente o SHA-256", async () => {
    const first = await createGoogleIdentityNonce();
    const second = await createGoogleIdentityNonce();
    expect(first.raw).not.toBe(second.raw);
    expect(first.hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(first.raw).not.toBe(first.hashed);

    const actual = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(first.raw));
    const expected = Buffer.from(actual).toString("hex");
    expect(first.hashed).toBe(expected);
  });
});
