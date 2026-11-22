/**
 * PayFlow desactivado — decisão do proprietário de 15/11/2026.
 *
 * Uma só chave estática (`PAYFLOW_INTEGRATION_API_KEY`) servia de prova de pagamento
 * para o SIGA, de sincronização e de entrada de administrador no PayFlow, em todas as
 * escolas ([análise 22](../../docs/auditoria/22-analise-critica-sistema-2026-11-15.md),
 * P1-2). Até haver chaves separadas e liquidação assinada, o PayFlow fica desligado em
 * todo o ecossistema. Falha fechada: sem a variável, está desligado.
 *
 * Para voltar a ligar são precisas as três:
 * - `PAYFLOW_ENABLED=true` no Worker do SIGA (liquidação, sincronização, SSO e cobrança
 *   de assinaturas pelo PayFlow);
 * - `VITE_PAYFLOW_ENABLED=true` no build do SIGA (botões e ligações na interface);
 * - `PAYFLOW_ENABLED=true` no Worker do PayFlow (`painel/payflow/worker/index.ts`).
 */
export const PAYFLOW_DISABLED_MESSAGE =
  "O PayFlow está desactivado. Os pagamentos registam-se na Tesouraria da escola.";

function flagOn(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** Servidor: o PayFlow está ligado neste Worker? (`PAYFLOW_ENABLED`) */
export function isPayflowServerEnabled(
  env: Record<string, string | undefined> | undefined = typeof process === "undefined"
    ? undefined
    : process.env,
): boolean {
  return flagOn(env?.["PAYFLOW_ENABLED"]);
}

/** Interface: mostrar botões e ligações do PayFlow? (`VITE_PAYFLOW_ENABLED`, no build) */
export function isPayflowUiEnabled(): boolean {
  return flagOn(import.meta.env?.["VITE_PAYFLOW_ENABLED"]);
}

/** Recusa a operação quando o PayFlow está desligado no servidor. */
export function assertPayflowEnabled(): void {
  if (!isPayflowServerEnabled()) throw new Error(PAYFLOW_DISABLED_MESSAGE);
}
