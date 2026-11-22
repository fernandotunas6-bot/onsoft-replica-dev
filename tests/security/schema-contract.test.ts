import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  checkSchemaContract,
  exposedFunctions,
  pendingFunctions,
} from "../../scripts/siga/check-schema-contract.mjs";

/**
 * Análise 22, P0: o deploy avisa quando o código publicado chama funções que a produção
 * não tem. Lê só o índice do PostgREST e não bloqueia a publicação.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("contrato de esquema da produção", () => {
  it("lê a lista de espera real, sem os comentários", () => {
    const names = pendingFunctions(read("tests/security/espera-migracao.ts"));
    expect(names).toEqual(
      expect.arrayContaining([
        "siga_write_assessment_scores_atomic",
        "siga_return_task_submission_atomic",
      ]),
    );
    expect(
      pendingFunctions('FUNCOES_ESPERA_MIGRACAO = new Set<string>([\n  // "comentada"\n])'),
    ).toEqual([]);
  });

  it("compara com as RPC expostas e não envia chaves opacas no Authorization", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ paths: { "/rpc/siga_a": {}, "/rpc/siga_b": {}, "/students": {} } }),
    );
    const result = await checkSchemaContract({
      url: "https://x.supabase.co/",
      key: "sb_secret_abc",
      expected: ["siga_a", "siga_c"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, missing: ["siga_c"] });
    const [calledUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://x.supabase.co/rest/v1/");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(exposedFunctions({ paths: { "/rpc/x": {} } })).toEqual(new Set(["x"]));
  });

  it("uma recusa do PostgREST não conta como falta nem como sucesso", async () => {
    const result = await checkSchemaContract({
      url: "https://x.supabase.co",
      key: "eyJ.a.b",
      expected: ["siga_a"],
      fetchImpl: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch,
    });
    expect(result.ok).toBeNull();
  });

  it("o deploy corre o passo depois da publicação, sem bloquear", () => {
    const workflow = read(".github/workflows/deploy-production.yml");
    const step = workflow.indexOf("node scripts/siga/check-schema-contract.mjs");
    expect(step).toBeGreaterThan(workflow.indexOf("node scripts/deploy-all.mjs"));
    expect(workflow).not.toContain("check-schema-contract.mjs --strict");
  });
});
