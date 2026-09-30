import { describe, expect, it } from "vitest";
import {
  SESSION_HINT_COOKIE,
  hasSessionHint,
  readSessionHintFromCookieHeader,
} from "@/features/auth/session-hint";

/**
 * O SSR desenha o ecrã de entrada quando não há pista de sessão (LCP), e o
 * carregamento quando há. A pista nunca decide acesso: só o que se desenha primeiro.
 */
describe("cookie-pista da sessão", () => {
  it("só '1' conta como sessão", () => {
    expect(hasSessionHint("1")).toBe(true);
    expect(hasSessionHint("0")).toBe(false);
    expect(hasSessionHint(null)).toBe(false);
    expect(hasSessionHint(undefined)).toBe(false);
    expect(hasSessionHint("true")).toBe(false);
  });

  it("lê o cookie no meio de outros", () => {
    expect(readSessionHintFromCookieHeader(`a=1; ${SESSION_HINT_COOKIE}=1; b=2`)).toBe(true);
    expect(readSessionHintFromCookieHeader(`${SESSION_HINT_COOKIE}=0`)).toBe(false);
    expect(readSessionHintFromCookieHeader("")).toBe(false);
  });

  it("não confunde cookies com nome parecido", () => {
    expect(readSessionHintFromCookieHeader(`x-${SESSION_HINT_COOKIE}=1`)).toBe(false);
  });
});
