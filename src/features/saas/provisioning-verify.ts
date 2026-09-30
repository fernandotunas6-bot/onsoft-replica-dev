/**
 * Verificação de que uma escola ficou completa.
 *
 * O provisionamento cria tenant, subscrição, domínio, escola, conta do
 * administrador, perfil, membership, papel e bootstrap — cada passo a lançar em
 * caso de erro. Na prática funciona: auditadas as 87 escolas em produção,
 * nenhuma criada por este fluxo tem peça em falta.
 *
 * Mas isso era verdade por construção, não por verificação. Nada afirmava o
 * conjunto no fim, e uma escola meio-criada é pior do que uma criação falhada:
 * o cliente recebe confirmação, tenta entrar, e encontra um produto partido
 * sem ninguém saber porquê.
 *
 * Esta função diz o que falta, em vez de deixar descobrir mais tarde.
 */

import { reportSigaEvent } from "@/lib/ops-report";

export type ProvisioningGap = {
  peca: string;
  detalhe: string;
};

type CountResult = { count: number | null; error?: { message: string } | null };

type Db = {
  from: (table: string) => {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => unknown;
  };
};

/**
 * Número de linhas, ou `null` se a contagem não pôde ser feita.
 *
 * Conta com `*`, não com `id`: `member_roles` não tem coluna `id` (a chave é
 * membership + papel). Contar `id` dava erro 42703, o erro era lido como
 * «zero linhas», e **todas** as escolas eram revertidas por «papel atribuído
 * em falta» — com o domínio e a conta do director presos a uma escola que não
 * se consegue apagar.
 */
async function contar(
  db: Db,
  table: string,
  filters: Array<[string, string]>,
): Promise<number | null> {
  let query = db.from(table).select("*", { count: "exact", head: true }) as {
    eq: (c: string, v: string) => unknown;
  };
  for (const [column, value] of filters) {
    query = query.eq(column, value) as typeof query;
  }
  const result = ((await (query as unknown as Promise<CountResult>)) ?? {
    count: 0,
  }) as CountResult;
  if (result.error) return null;
  return result.count ?? 0;
}

/**
 * Peças sem as quais a escola não é utilizável. A ordem é a do fluxo, para a
 * primeira falha apontar para o passo que correu mal.
 */
export async function findProvisioningGaps(
  db: unknown,
  ids: { tenantId: string; schoolId: string; adminUserId: string },
): Promise<ProvisioningGap[]> {
  const client = db as Db;
  const gaps: ProvisioningGap[] = [];

  const checks: Array<{
    peca: string;
    detalhe: string;
    table: string;
    filters: Array<[string, string]>;
    minimo?: number;
  }> = [
    {
      peca: "subscrição",
      detalhe: "sem subscrição o plano e o trial não existem para a escola",
      table: "subscriptions",
      filters: [["tenant_id", ids.tenantId]],
    },
    {
      peca: "domínio",
      detalhe: "sem entrada em tenant_domains a escola não é resolúvel por endereço",
      table: "tenant_domains",
      filters: [["tenant_id", ids.tenantId]],
    },
    {
      peca: "perfil do administrador",
      detalhe: "sem perfil a conta entra sem cargo nem escola",
      table: "profiles",
      filters: [["id", ids.adminUserId]],
    },
    {
      peca: "membership activa",
      detalhe: "sem membership o administrador não resolve a escola e não vê nada",
      table: "school_memberships",
      filters: [
        ["school_id", ids.schoolId],
        ["user_id", ids.adminUserId],
      ],
    },
    {
      peca: "papel atribuído",
      detalhe: "sem member_roles a conta não tem permissões na escola",
      table: "member_roles",
      filters: [["school_id", ids.schoolId]],
    },
    {
      peca: "papéis da escola",
      detalhe: "o bootstrap cria os papéis padrão; sem eles não há a quem delegar",
      table: "roles",
      filters: [["school_id", ids.schoolId]],
      minimo: 2,
    },
  ];

  for (const check of checks) {
    const total = await contar(client, check.table, check.filters);
    // Uma consulta que falha não prova que a peça falta. Reverter por isso
    // desfazia uma escola completa — e a reversão não é total (ver
    // provisioning-core). Fica registado como não verificado.
    if (total === null) {
      reportSigaEvent("tenant.provisioning.verify.unavailable", {
        tenant_id: ids.tenantId,
        school_id: ids.schoolId,
        entity: check.table,
      });
      continue;
    }
    if (total < (check.minimo ?? 1)) {
      gaps.push({ peca: check.peca, detalhe: check.detalhe });
    }
  }

  return gaps;
}

export function describeProvisioningGaps(gaps: ProvisioningGap[]): string {
  return (
    "A escola não ficou completa e foi revertida. Em falta: " +
    gaps.map((g) => `${g.peca} (${g.detalhe})`).join("; ") +
    "."
  );
}
