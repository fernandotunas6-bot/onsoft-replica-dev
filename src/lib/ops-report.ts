import { describeError } from "@/lib/error-capture";

/**
 * Observabilidade do SIGA — espelha `painel/payflow/lib/ops-report.ts`, que já
 * fazia isto do lado do PayFlow.
 *
 * O SIGA corre num Worker Cloudflare e, até aqui, o tratamento de erros eram
 * 146 chamadas a `console.*` sem estrutura nem contexto. Quando uma escola diz
 * que «a pauta não gravou», não havia forma de saber se aconteceu, a quem,
 * quantas vezes, ou se continua a acontecer.
 *
 * Duas regras deliberadas, por causa da natureza dos dados — um sistema escolar
 * guarda informação de menores:
 *
 * 1. **Nada passa sem estar na lista.** Um campo que não conste da allowlist é
 *    descartado, não truncado nem ofuscado. É mais fácil acrescentar um campo
 *    à lista do que apagar um nome de aluno dos registos de um ano inteiro.
 *
 * 2. **O log do servidor e o alerta externo têm listas diferentes.** O log fica
 *    na infraestrutura da escola e pode conter a descrição do erro; o alerta
 *    sai para um webhook de terceiros (Slack, por exemplo) e só leva
 *    identificadores e códigos.
 */

export type OpsScalar = string | number | boolean | null;

/** Campos aceites no log estruturado do servidor. */
const LOG_ALLOWLIST = new Set([
  // contexto multi-tenant — o que faltava para responder "a quem aconteceu"
  "school_id",
  "tenant_id",
  "user_id",
  "role",
  // o que estava a ser feito
  "module",
  "action",
  "entity",
  "entity_id",
  // em que passo de um fluxo com vários passos — valores nossos, enumerados
  "stage",
  // domínio financeiro
  "invoice_id",
  "payment_id",
  "transaction_id",
  "reference",
  "amount_cents",
  "currency",
  // domínio académico
  "assessment_item_id",
  "enrollment_id",
  "class_group_id",
  "academic_year",
  // resultado
  "code",
  "reason",
  "source",
  "http_status",
  "idempotent",
  "count",
  "duration_ms",
  // diagnóstico — só no log, nunca no alerta
  "error",
]);

/**
 * Campos que podem sair para um webhook externo. Sem texto livre: a descrição
 * de um erro pode arrastar o nome de um aluno numa mensagem de constraint.
 */
const ALERT_ALLOWLIST = new Set([
  "school_id",
  "tenant_id",
  "module",
  "action",
  "entity",
  "entity_id",
  "stage",
  "invoice_id",
  "payment_id",
  "transaction_id",
  "code",
  "reason",
  "source",
  "http_status",
  "idempotent",
  "count",
]);

/** Eventos que merecem acordar alguém, além de ficarem no log. */
const ALERTABLE_EVENTS = new Set([
  "finance.settlement.failed",
  "finance.settlement.mismatch",
  "assessment.score.write_failed",
  "assessment.pauta.publish_failed",
  "auth.mfa.lockout",
  "tenant.provisioning.failed",
]);

export function isAlertableEvent(event: string): boolean {
  return ALERTABLE_EVENTS.has(event) || event.endsWith(".failed");
}

function sanitize(
  fields: Record<string, unknown>,
  allowlist: Set<string>,
): Record<string, OpsScalar> {
  const clean: Record<string, OpsScalar> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!allowlist.has(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      clean[key] = value;
    }
  }
  return clean;
}

export function sanitizeLogFields(fields: Record<string, unknown>): Record<string, OpsScalar> {
  return sanitize(fields, LOG_ALLOWLIST);
}

export function sanitizeAlertFields(fields: Record<string, unknown>): Record<string, OpsScalar> {
  return sanitize(fields, ALERT_ALLOWLIST);
}

/** Uma linha JSON por evento — consultável nos logs do Worker. */
export function logSigaEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.info(
    JSON.stringify({
      app: "siga",
      event,
      ts: new Date().toISOString(),
      ...sanitizeLogFields(fields),
    }),
  );
}

/** URL de saída definida só no servidor — nunca vinda de um pedido. */
function resolveAlertWebhookUrl(): string | null {
  const raw = (typeof process !== "undefined" && process.env?.SIGA_ALERT_WEBHOOK_URL?.trim()) || "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function dispatchAlert(event: string, fields: Record<string, unknown>): Promise<void> {
  if (!isAlertableEvent(event)) return;
  const webhookUrl = resolveAlertWebhookUrl();
  if (!webhookUrl) return;

  const payload = { app: "siga", event, ...sanitizeAlertFields(fields) };
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[SIGA] ${event}`, payload }),
    });
  } catch {
    // Um alerta que falha nunca pode derrubar a operação que o originou.
  }
}

/**
 * Regista um evento operacional. Alerta também, quando o evento o justifica.
 *
 * O envio do alerta não é aguardado de propósito: nenhuma escrita de nota ou de
 * recibo deve esperar por um webhook de terceiros.
 */
export function reportSigaEvent(event: string, fields: Record<string, unknown> = {}): void {
  logSigaEvent(event, fields);
  void dispatchAlert(event, fields);
}

/** O mesmo, preservando a cadeia de causas do erro na descrição. */
export function reportSigaError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  reportSigaEvent(event, { ...fields, error: describeError(error) });
}
