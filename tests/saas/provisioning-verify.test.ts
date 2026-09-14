import { describe, expect, it } from "vitest";
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
