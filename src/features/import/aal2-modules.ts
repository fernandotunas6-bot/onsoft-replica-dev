/**
 * Importações que só gravam com 2FA activo na sessão — as mesmas que à mão o exigem:
 * regras de cobrança (updateBillingSettings), pagamentos e faturas (register_payment e
 * issueInvoice, com aal2 na base) e notas (escritas directas com is_aal2). Antes só
 * «propinas» o pedia e um pagamento importado passava sem 2FA (auditoria 13, F-07).
 * A simulação (dry run) não grava e não o exige.
 */
const AAL2_IMPORT_ACTIONS: Readonly<Record<string, string>> = {
  propinas: "Importar as regras de cobrança",
  pagamentos: "Importar pagamentos",
  dividas: "Importar dívidas",
  historico_financeiro: "Importar o histórico financeiro",
  notas: "Importar notas",
  avaliacoes: "Importar avaliações",
  pautas: "Importar pautas",
};

/** A acção a nomear no erro de 2FA, ou null se o módulo não o exige. */
export function aal2ActionForImport(module: string): string | null {
  return AAL2_IMPORT_ACTIONS[module] ?? null;
}
