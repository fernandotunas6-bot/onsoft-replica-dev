import { describe, expect, it } from "vitest";
import { bridgeInternalPath } from "../../painel/web/src/lib/bridge-target";

/**
 * WEB: as pontes dos endereços herdados do modelo (/settings, /auth/sign-up…) com
 * destino absoluto no próprio WEB iam parar a /settings/https:/…/pricing (404),
 * porque o <Navigate> trata «https://…» como caminho relativo.
 */
const ORIGIN = "https://siga-web.pages.dev";

describe("bridgeInternalPath", () => {
  it("endereço absoluto do próprio WEB vira caminho interno, com query e âncora", () => {
    expect(bridgeInternalPath({ to: `${ORIGIN}/pricing` }, ORIGIN)).toBe("/pricing");
    expect(bridgeInternalPath({ to: `${ORIGIN}/start?plan=business#passo` }, ORIGIN)).toBe(
      "/start?plan=business#passo",
    );
  });

  it("caminhos relativos ficam como estão", () => {
    expect(bridgeInternalPath({ to: "/" }, ORIGIN)).toBe("/");
    expect(bridgeInternalPath({ to: "/auth/sign-in" }, ORIGIN)).toBe("/auth/sign-in");
  });

  it("outra app, outro domínio ou marcado como externo: navegação completa", () => {
    expect(bridgeInternalPath({ to: "https://portal-siga.com/" }, ORIGIN)).toBeNull();
    expect(bridgeInternalPath({ to: `${ORIGIN}/pricing`, external: true }, ORIGIN)).toBeNull();
    expect(bridgeInternalPath({ to: "//evil.example/pricing" }, ORIGIN)).toBeNull();
    expect(bridgeInternalPath({ to: "não é endereço" }, ORIGIN)).toBeNull();
  });
});
