import { describe, expect, it } from "vitest";
import { assertSafeCleanupTarget, assertSafeE2ETarget } from "../../scripts/siga/e2e-safety.mjs";

const staging = {
  SIGA_E2E_ALLOW_WRITES: "1",
  SIGA_E2E_PROJECT_REF: "audittest",
  SUPABASE_URL: "https://audittest.supabase.co",
  VITE_SIGA_URL: "http://localhost:3006",
};
describe("E2E com escrita", () => {
  it("exige opt-in e destino explícito antes de criar clientes ou fazer pedidos", () => {
    expect(() => assertSafeE2ETarget({})).toThrow(/bloqueado/);
    expect(() => assertSafeE2ETarget({ ...staging, SIGA_E2E_ALLOW_WRITES: "0" })).toThrow(
      /bloqueado/,
    );
    expect(() => assertSafeE2ETarget({ ...staging, SIGA_E2E_PROJECT_REF: "" })).toThrow(/staging/);
  });
  it("recusa produção, incluindo mistura de variáveis e Management API", () => {
    for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
      expect(() =>
        assertSafeE2ETarget({ ...staging, [key]: "https://xodgfmxiaunpamctfeea.supabase.co" }),
      ).toThrow(/produção/);
    }
    expect(() =>
      assertSafeE2ETarget({ ...staging, SUPABASE_PROJECT_ID: "xodgfmxiaunpamctfeea" }),
    ).toThrow(/distintos/);
    expect(() =>
      assertSafeE2ETarget({ ...staging, SIGA_E2E_PROJECT_REF: "xodgfmxiaunpamctfeea" }),
    ).toThrow(/produção/);
  });
  it("recusa aplicação remota, URL enganador e projecto diferente", () => {
    for (const url of ["https://app.portal-siga.com", "https://localhost.evil.test", "not-url"]) {
      expect(() => assertSafeE2ETarget({ ...staging, VITE_SIGA_URL: url })).toThrow(/bloqueado/);
    }
    for (const url of [
      "https://audittest.supabase.co.evil.test",
      "https://other.supabase.co",
      "https://user:pass@audittest.supabase.co",
    ]) {
      expect(() => assertSafeE2ETarget({ ...staging, SUPABASE_URL: url })).toThrow(/bloqueado/);
    }
  });
  it("aceita staging consistente e Supabase local explicitamente identificado", () => {
    expect(assertSafeE2ETarget(staging).projectRef).toBe("audittest");
    expect(
      assertSafeE2ETarget({
        ...staging,
        SIGA_E2E_PROJECT_REF: "local",
        SUPABASE_URL: "http://127.0.0.1:54321",
      }).projectRef,
    ).toBe("local");
  });
});

const producao = { SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co" };

describe("limpeza de restos de E2E", () => {
  it("recusa a produção sem o opt-in próprio", () => {
    expect(() => assertSafeCleanupTarget(producao)).toThrow(/SIGA_CLEANUP_ALLOW_PRODUCTION/);
  });

  it("aceita a produção com o opt-in próprio — é o inverso de correr E2E contra ela", () => {
    const alvo = assertSafeCleanupTarget({ ...producao, SIGA_CLEANUP_ALLOW_PRODUCTION: "1" });
    expect(alvo).toEqual({ projectRef: "xodgfmxiaunpamctfeea", production: true });
  });

  it("o opt-in da limpeza não abre a porta ao E2E com escrita", () => {
    expect(() => assertSafeE2ETarget({ ...producao, SIGA_CLEANUP_ALLOW_PRODUCTION: "1" })).toThrow(
      /bloqueado/,
    );
  });

  it("fora da produção valem as regras estritas do E2E", () => {
    expect(assertSafeCleanupTarget(staging).projectRef).toBe("audittest");
    expect(() =>
      assertSafeCleanupTarget({ SUPABASE_URL: "https://audittest.supabase.co" }),
    ).toThrow(/bloqueado/);
  });

  it("recusa URL enganador, credenciais embutidas e projectos misturados", () => {
    for (const url of [
      "https://xodgfmxiaunpamctfeea.supabase.co.evil.test",
      "https://u:p@xodgfmxiaunpamctfeea.supabase.co",
      "not-url",
    ]) {
      expect(() =>
        assertSafeCleanupTarget({ SUPABASE_URL: url, SIGA_CLEANUP_ALLOW_PRODUCTION: "1" }),
      ).toThrow(/Limpeza bloqueada/);
    }
    expect(() =>
      assertSafeCleanupTarget({
        ...producao,
        VITE_SUPABASE_URL: "https://outro.supabase.co",
        SIGA_CLEANUP_ALLOW_PRODUCTION: "1",
      }),
    ).toThrow(/distintos/);
    expect(() =>
      assertSafeCleanupTarget({
        ...producao,
        SUPABASE_PROJECT_ID: "outro",
        SIGA_CLEANUP_ALLOW_PRODUCTION: "1",
      }),
    ).toThrow(/distintos/);
  });

  it("exige um URL Supabase", () => {
    expect(() => assertSafeCleanupTarget({ SIGA_CLEANUP_ALLOW_PRODUCTION: "1" })).toThrow(
      /URL Supabase em falta/,
    );
  });
});
