import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  isSyntheticE2EAccount,
  readAllPages,
  summarizeE2EResidue,
} from "../../scripts/siga/check-e2e-staging-residue.mjs";

const root = process.cwd();

describe("auditoria E2E final — sem eliminações nem falso sucesso", () => {
  it("não aceita endereços reais ou de domínios semelhantes", () => {
    expect(isSyntheticE2EAccount("e2e+mat-abc@siga-plus.test")).toBe(true);
    expect(isSyntheticE2EAccount(" E2E+WEB-ABC@SIGA-PLUS.TEST ")).toBe(true);
    expect(isSyntheticE2EAccount("director@escola.ao")).toBe(false);
    expect(isSyntheticE2EAccount("e2e+mat@siga-plus.test.example")).toBe(false);
  });

  it("falha quando sobra uma escola, uma conta Auth ou ambas", () => {
    expect(
      summarizeE2EResidue(
        [{ slug: "escola-real" }, { slug: "e2e-iso-a-123" }],
        [{ email: "e2e+mat-456@siga-plus.test" }],
      ),
    ).toEqual({ schoolCount: 1, userCount: 1, clean: false });
    expect(summarizeE2EResidue([], [{ email: "e2e+orphan@siga-plus.test" }]).clean).toBe(
      false,
    );
    expect(summarizeE2EResidue([{ slug: "escola-real" }], []).clean).toBe(true);
  });

  it("recusa inventários incompletos em vez de os tratar como vazios", () => {
    expect(() => summarizeE2EResidue(null as never, [])).toThrow(/incompleta/);
  });

  it("procura páginas seguintes e só conclui perante última página incompleta", async () => {
    const fetchPage = vi.fn(async (page: number, count: number) => ({
      data: page === 1 ? Array.from({ length: count }, (_, i) => ({ id: i })) : [{ id: 201 }],
      error: null,
    }));
    const result = await readAllPages(fetchPage, "ensaios");
    expect(result).toHaveLength(201);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 200);
  });

  it("falha fechado em erro remoto e em paginação truncada", async () => {
    await expect(
      readAllPages(async () => ({ data: null, error: { message: "secret" } }), "Auth"),
    ).rejects.toThrow("falhou a leitura paginada de Auth");
    await expect(
      readAllPages(
        async () => ({ data: Array.from({ length: 200 }, () => ({})), error: null }),
        "Auth",
      ),
    ).rejects.toThrow(/limite de páginas/);
  });

  it("o orquestrador audita mesmo com falha de testes e não oculta o resultado", () => {
    const pipeline = readFileSync(resolve(root, "scripts/siga/e2e-ecosystem-live.mjs"), "utf8");
    expect(pipeline).toContain('["scripts/siga/check-e2e-staging-residue.mjs"]');
    expect(pipeline).toContain("new AggregateError(");
    expect(pipeline).not.toContain('["scripts/siga/e2e-cleanup-stale.mjs"]');
    expect(pipeline).not.toContain(".catch(() => undefined)");
  });

  it("o arnês Python não reutiliza o NIF estático entre escolas", () => {
    const python = readFileSync(resolve(root, "scripts/siga/e2e-ecosystem-playwright.py"), "utf8");
    expect(python).toContain('"nif": synthetic_nif(slug)');
    expect(python).toContain("nif = synthetic_nif(slug)");
    expect(python).not.toContain('"nif": "5417000000"');
    expect(python).toContain("value = ((value ^ ord(character)) * 16777619) & 0xFFFFFFFF");
  });
});
