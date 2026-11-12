import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isE2ETenantSlug } from "../../tests/e2e/helpers/sga-live-admin";

describe("isE2ETenantSlug", () => {
  it("aceita slugs dos testes @live", () => {
    expect(isE2ETenantSlug("e2e-mf2abc123")).toBe(true);
    expect(isE2ETenantSlug("web-mf2abc123")).toBe(true);
    expect(isE2ETenantSlug("mat-mf2abc123")).toBe(true);
    expect(isE2ETenantSlug("gw-mf2abc123")).toBe(true);
  });

  it("aceita o slug de dois segmentos que o teste do WEB cria", () => {
    // `e2e-web-<id>` escapava ao padrão de um só segmento e ficava para sempre na
    // produção: eram 43 restos de E2E e a limpeza só apanhava 42.
    expect(isE2ETenantSlug("e2e-web-mts7ka0q")).toBe(true);
    expect(isE2ETenantSlug("e2e-web-mf2abc123")).toBe(true);
  });

  it("rejeita slugs de produção ou demo", () => {
    expect(isE2ETenantSlug("dom-afonso-demo")).toBe(false);
    expect(isE2ETenantSlug("escola-real")).toBe(false);
    // O tenant a que `resolveTenantLookup` recorre em desenvolvimento local, e que
    // existe na produção: alargar o padrão não o pode passar a apanhar.
    expect(isE2ETenantSlug("minha-escola")).toBe(false);
    expect(isE2ETenantSlug("epatuloko")).toBe(false);
    expect(isE2ETenantSlug("ekovongo")).toBe(false);
  });

  it("exige pelo menos um segmento depois do prefixo", () => {
    expect(isE2ETenantSlug("e2e")).toBe(false);
    expect(isE2ETenantSlug("e2e-")).toBe(false);
    expect(isE2ETenantSlug("")).toBe(false);
  });

  it("o padrão do script de limpeza é o mesmo que o do helper", () => {
    // Duas cópias do padrão: esta guarda a do script (lida do ficheiro, para não
    // arrastar os efeitos do módulo) contra a do helper, que os testes acima cobrem.
    const source = readFileSync(
      path.join(process.cwd(), "scripts/siga/e2e-cleanup-lib.mjs"),
      "utf8",
    );
    const declared = /E2E_SLUG_PATTERN\s*=\s*(\/.*\/\w*);/.exec(source)?.[1];
    expect(declared).toBe("/^(e2e|web|mat|gw)(-[a-z0-9]+)+$/i");
  });
});

describe("cleanupE2ETenantBySlug", () => {
  it("recusa slug fora do padrão E2E", async () => {
    const { cleanupE2ETenantBySlug } = await import("../../tests/e2e/helpers/sga-live-admin");
    await expect(cleanupE2ETenantBySlug("dom-afonso-demo")).rejects.toThrow(/Refusing cleanup/);
    await expect(cleanupE2ETenantBySlug("minha-escola")).rejects.toThrow(/Refusing cleanup/);
  });
});
