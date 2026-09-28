import type { MailboxConfig, MailboxProvisionResult, MailboxItem } from "./mailbox-providers";

/**
 * mailbox-zoho.ts
 * Integração com Zoho Mail (Directory API v1)
 */

function getZohoCreds() {
  const orgId = process.env.ZOHO_MAIL_ORG_ID;
  const clientId = process.env.ZOHO_MAIL_CLIENT_ID;
  const secret = process.env.ZOHO_MAIL_CLIENT_SECRET;
  const token = process.env.ZOHO_MAIL_REFRESH_TOKEN;

  if (!orgId || !clientId || !secret || !token) return null;
  return { orgId, clientId, secret, token };
}

// Simulamos as chamadas para não bloquear caso não haja conta Zoho
export async function zohoCreateMailbox(config: MailboxConfig): Promise<MailboxProvisionResult> {
  const creds = getZohoCreds();
  if (!creds) return { ok: false, reason: "Credenciais Zoho em falta." };

  // A chamada à API do Zoho ainda não está implementada. Responder "ok" aqui
  // registava uma caixa de correio que não existe no Zoho.
  void config;
  return { ok: false, reason: "Criação de caixas Zoho Mail ainda não está implementada." };
}

export async function zohoSuspendMailbox(
  accountId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const creds = getZohoCreds();
  if (!creds) return { ok: false, reason: "Credenciais Zoho em falta." };

  void accountId;
  return { ok: false, reason: "Suspensão de caixas Zoho Mail ainda não está implementada." };
}

export async function zohoListMailboxes(domain: string): Promise<MailboxItem[]> {
  const creds = getZohoCreds();
  if (!creds) return [];

  return [];
}
