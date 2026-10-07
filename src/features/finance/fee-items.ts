/**
 * Itens do plano de propinas (`fee_items`) e o preço por classe.
 *
 * Um item com `grade_level_id` é o preço de uma classe (migração
 * 20261005150000_fee_items_grade_level.sql); sem ele é o preço geral. Os itens lêem-se
 * com `select("*")` e escolhem-se aqui, em código: antes de a migração ser aplicada a
 * coluna não existe, e uma consulta que a nomeasse partia a emissão de faturas.
 */
export type FeeItemRow = {
  id: string;
  name: string;
  kind: string;
  code: string;
  amount: number;
  is_active: boolean;
  grade_level_id: string | null;
};

/** Normaliza uma linha de `select("*")` (a coluna da classe pode ainda não existir). */
export function toFeeItemRow(row: Record<string, unknown>): FeeItemRow {
  return {
    id: String(row["id"]),
    name: String(row["name"] ?? ""),
    kind: String(row["kind"] ?? ""),
    code: String(row["code"] ?? ""),
    amount: Number(row["amount"] ?? 0),
    is_active: Boolean(row["is_active"]),
    grade_level_id: row["grade_level_id"] ? String(row["grade_level_id"]) : null,
  };
}

/**
 * Que itens servem a uma fatura: o emolumento do Ensino Superior pelo código; a propina
 * e a matrícula pelo tipo; «Documento» e «Outro» qualquer item que não seja um
 * emolumento (não se ligam a um emolumento do Superior por acaso).
 */
export function feeItemMatcher(category: { feeCode: string | null; kind: string | null }) {
  return (item: FeeItemRow) =>
    category.feeCode
      ? item.code === category.feeCode
      : category.kind
        ? item.kind === category.kind
        : item.kind !== "service";
}

/**
 * O item activo que serve: o da classe do aluno, se a escola lhe deu preço; senão o
 * geral (sem classe). Um item de outra classe nunca serve.
 */
export function pickFeeItem(
  items: FeeItemRow[],
  matches: (item: FeeItemRow) => boolean,
  gradeLevelId: string | null,
): FeeItemRow | null {
  const active = items.filter((item) => item.is_active && matches(item));
  return (
    (gradeLevelId ? active.find((item) => item.grade_level_id === gradeLevelId) : undefined) ??
    active.find((item) => !item.grade_level_id) ??
    null
  );
}

/**
 * O erro de uma consulta a `fee_items` diz que falta a coluna da classe, ou seja, que
 * docs/agents/SIGA_aplicar_propina_por_classe.sql ainda não foi aplicado.
 */
export function isMissingGradeColumn(
  error: { code?: string | null; message?: string | null } | null,
): boolean {
  return Boolean(
    error && /grade_level_id|42703|PGRST204/i.test(`${error.code ?? ""} ${error.message ?? ""}`),
  );
}

/** Código do item de propina de uma classe: único no plano (`fee_items` tem UNIQUE no código). */
export function gradeTuitionCode(gradeLevelId: string) {
  return `TUITION-${gradeLevelId}`;
}

/**
 * Mês a que a fatura respeita (`competence_month`, sempre dia 1).
 *
 * A propina mensal é do mês do vencimento: é essa a propina que se está a cobrar.
 * Antes usava-se o mês da emissão, e a propina de Setembro emitida a 11/08 ficava
 * como de Agosto — na produção, uma escola real ficou com duas propinas de Agosto
 * pagas para o mesmo aluno (auditoria 13). As outras taxas seguem a emissão.
 */
export function invoiceCompetenceMonth(input: {
  kind: string | null;
  dueOn: string;
  issuedOn: string;
}): string {
  const base = input.kind === "tuition" ? input.dueOn : input.issuedOn;
  return `${base.slice(0, 7)}-01`;
}
