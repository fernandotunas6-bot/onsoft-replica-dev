import { describe, expect, it } from "vitest";
import { assertStagingReady } from "../../scripts/siga/check-staging-readiness.mjs";

const STAGING_REF = "abcde12345abcde12345";
const valid = {
  STAGING_SUPABASE_PROJECT_ID: STAGING_REF,
  STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
  STAGING_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  STAGING_SUPABASE_SECRET_KEY: "secret_fixture_do_not_use",
};

describe("pré-verificação E2E @live", () => {
  it("não permite conclusão verde sem os quatro secrets de staging", () => {
    for (const key of Object.keys(valid)) {
      expect(() => assertStagingReady({ ...valid, [key]: "" })).toThrow(/Staging não configurado/);
    }
    expect(() => assertStagingReady({})).toThrow(/E2E não foi executado/);
  });

  it("recusa produção, URL trocado e variáveis herdadas com outro projecto", () => {
    expect(() =>
      assertStagingReady({
        ...valid,
        STAGING_SUPABASE_PROJECT_ID: "xodgfmxiaunpamctfeea",
        STAGING_SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co",
      }),
    ).toThrow(/produção/);
    expect(() =>
      assertStagingReady({ ...valid, STAGING_SUPABASE_URL: "https://outro.supabase.co" }),
    ).toThrow(/inesperado|bloqueado/);
    expect(() =>
      assertStagingReady({
        ...valid,
        SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co",
      }),
    ).toThrow(/produção/);
    expect(() =>
      assertStagingReady({ ...valid, SUPABASE_PROJECT_ID: "projectrefdifferent1" }),
    ).toThrow(/distintos/);
  });

  it("recusa projecto malformado ou URL sem HTTPS", () => {
    expect(() => assertStagingReady({ ...valid, STAGING_SUPABASE_PROJECT_ID: "staging" })).toThrow(
      /inválido/,
    );
    expect(() =>
      assertStagingReady({
        ...valid,
        STAGING_SUPABASE_URL: `http://${STAGING_REF}.supabase.co`,
      }),
    ).toThrow(/bloqueado/);
  });

  it("valida a estrutura sem expor qualquer valor das credenciais", () => {
    expect(assertStagingReady(valid)).toEqual({ projectRef: STAGING_REF });
    const bad = { ...valid, STAGING_SUPABASE_URL: "invalid", STAGING_SUPABASE_SECRET_KEY: "DO-NOT-LOG-ME" };
    try {
      assertStagingReady(bad);
      throw new Error("Deveria recusar");
    } catch (e) {
      expect(String(e)).not.toContain("DO-NOT-LOG-ME");
    }
  });
});
