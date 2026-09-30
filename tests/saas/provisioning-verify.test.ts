import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findProvisioningGaps,
  describeProvisioningGaps,
} from "@/features/saas/provisioning-verify";

/**
 * O provisionamento criava tudo e não confirmava nada. Funcionava por
 * construção — auditadas as 87 escolas em produção, nenhuma criada por este
 * fluxo tem peça em falta — mas uma escola meio-criada é pior do que uma
 * criação falhada: o cliente recebe confirmação e encontra um produto partido.
 */

const IDS = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  schoolId: "22222222-2222-2222-2222-222222222222",
  adminUserId: "33333333-3333-3333-3333-333333333333",
};

/** Base falsa onde cada tabela devolve a contagem que lhe dermos. */
function fakeDb(counts: Record<string, number>) {
  return {
    from(table: string) {
      const result = Promise.resolve({ count: counts[table] ?? 0 });
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        then: (...args: unknown[]) =>
          (result.then as (...a: unknown[]) => unknown).apply(result, args),
      };
      return chain;
    },
  };
}

const COMPLETO = {
  subscriptions: 1,
  tenant_domains: 1,
  profiles: 1,
  school_memberships: 1,
  member_roles: 1,
  roles: 8,
};

describe("findProvisioningGaps", () => {
  it("não encontra falhas numa escola completa", async () => {
    expect(await findProvisioningGaps(fakeDb(COMPLETO), IDS)).toEqual([]);
  });

  it("detecta cada peça em falta, uma a uma", async () => {
    const esperado: Record<string, string> = {
      subscriptions: "subscrição",
      tenant_domains: "domínio",
      profiles: "perfil do administrador",
      school_memberships: "membership activa",
      member_roles: "papel atribuído",
    };

    for (const [tabela, peca] of Object.entries(esperado)) {
      const gaps = await findProvisioningGaps(fakeDb({ ...COMPLETO, [tabela]: 0 }), IDS);
      expect(
        gaps.map((g) => g.peca),
        tabela,
      ).toEqual([peca]);
    }
  });

  it("exige mais do que um papel — o bootstrap cria os padrão", async () => {
    const gaps = await findProvisioningGaps(fakeDb({ ...COMPLETO, roles: 1 }), IDS);
    expect(gaps.map((g) => g.peca)).toEqual(["papéis da escola"]);
  });

  it("acumula várias falhas em vez de parar na primeira", async () => {
    const gaps = await findProvisioningGaps(
      fakeDb({ ...COMPLETO, tenant_domains: 0, school_memberships: 0 }),
      IDS,
    );
    expect(gaps.map((g) => g.peca)).toEqual(["domínio", "membership activa"]);
  });

  it("a mensagem diz o que falta e que foi revertido", async () => {
    const gaps = await findProvisioningGaps(fakeDb({ ...COMPLETO, tenant_domains: 0 }), IDS);
    const msg = describeProvisioningGaps(gaps);
    expect(msg).toContain("revertida");
    expect(msg).toContain("domínio");
    expect(msg).toContain("resolúvel por endereço");
  });
});

/**
 * As mesmas invariantes existem em dois sítios: `findProvisioningGaps`, que
 * corre no momento da criação, e `scripts/siga/audit-provisioning.mjs`, que as
 * aplica às escolas que já existem. Duas listas que se separam em silêncio
 * dariam a resposta errada com ar de resposta certa — uma escola "completa" no
 * script e incompleta na criação, ou o contrário.
 *
 * O script é lido como texto de propósito: importá-lo executaria a consulta à
 * base.
 */
describe("o script de auditoria da frota não se separa da verificação em runtime", () => {
  const raiz = resolve(__dirname, "../..");
  const pecasDe = (ficheiro: string) =>
    new Set(
      [...readFileSync(resolve(raiz, ficheiro), "utf8").matchAll(/peca:\s*"([^"]+)"/g)].map(
        (m) => m[1],
      ),
    );

  it("o script cobre todas as peças verificadas na criação", () => {
    const runtime = pecasDe("src/features/saas/provisioning-verify.ts");
    const script = pecasDe("scripts/siga/audit-provisioning.mjs");

    expect(runtime.size).toBeGreaterThanOrEqual(6);
    const emFalta = [...runtime].filter((peca) => !script.has(peca));
    expect(
      emFalta,
      `peças verificadas na criação e não auditadas na frota: ${emFalta.join(", ")}. ` +
        `Uma escola pode ficar sem elas e o script diz que está bem.`,
    ).toEqual([]);
  });
});

describe("findProvisioningGaps contra as colunas da produção", () => {
  /** Como o PostgREST: pedir uma coluna que a tabela não tem dá erro. */
  function strictDb(counts: Record<string, number>) {
    const snapshot = JSON.parse(
      readFileSync(resolve(process.cwd(), "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
    ) as { tabelas: Array<{ tabela: string; colunas: string[] }> };
    const columns = new Map(snapshot.tabelas.map((t) => [t.tabela, t.colunas]));
    return {
      from(table: string) {
        let result: Promise<{ count: number | null; error: { message: string } | null }> =
          Promise.resolve({ count: counts[table] ?? 0, error: null });
        const chain: Record<string, unknown> = {
          select: (cols: string) => {
            const missing = cols
              .split(",")
              .map((c) => c.trim())
              .filter((c) => c !== "*" && !(columns.get(table) ?? []).includes(c));
            if (missing.length) {
              result = Promise.resolve({
                count: null,
                error: { message: `column ${table}.${missing[0]} does not exist` },
              });
            }
            return chain;
          },
          eq: () => chain,
          then: (...args: unknown[]) =>
            (result.then as (...a: unknown[]) => unknown).apply(result, args),
        };
        return chain;
      },
    };
  }

  it("uma escola completa não tem falhas (member_roles não tem coluna id)", async () => {
    expect(await findProvisioningGaps(strictDb(COMPLETO), IDS)).toEqual([]);
  });

  it("um erro de leitura não é uma peça em falta", async () => {
    const failing = {
      from() {
        const result = Promise.resolve({ count: null, error: { message: "timeout" } });
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          then: (...args: unknown[]) =>
            (result.then as (...a: unknown[]) => unknown).apply(result, args),
        };
        return chain;
      },
    };
    expect(await findProvisioningGaps(failing, IDS)).toEqual([]);
  });
});

describe("reversão do provisionamento", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/features/saas/provisioning-core.ts"),
    "utf8",
  );

  it("apaga o que o bootstrap cria antes da conta, e lê o erro de deleteUser", () => {
    const cleanup = source.slice(source.indexOf("const cleanupSchool"));
    for (const table of ["school_settings", "document_sequences", "enrollment_forms"]) {
      expect(cleanup.indexOf(`"${table}"`)).toBeGreaterThan(-1);
      expect(cleanup.indexOf(`"${table}"`)).toBeLessThan(cleanup.indexOf("deleteUser("));
    }
    expect(cleanup).toMatch(
      /const \{ error: deleteErr \} = await supabaseAdmin\.auth\.admin\.deleteUser/,
    );
  });

  it("escola que não se apaga fica arquivada e o endereço é libertado", () => {
    expect(source).toMatch(/update\(\{ status: "archived" \}\)/);
    expect(source).toMatch(/status: "provisioning_failed"/);
    expect(source).toMatch(/slug: `\$\{data\.slug\}-falhou-/);
  });
});
