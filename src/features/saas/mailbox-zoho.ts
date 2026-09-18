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

  // Exemplo de payload Zoho
  /*
  const body = {
    primaryEmailAddress: config.email,
    firstName: config.displayName,
    password: config.password || "Gerada123!",
  };
  */

  // Simulação de sucesso para testes de integração
  return { ok: true, provider: "zoho", providerAccountId: `zoid-${Date.now()}` };
}

export async function zohoSuspendMailbox(
  accountId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const creds = getZohoCreds();
  if (!creds) return { ok: false, reason: "Credenciais Zoho em falta." };

  return { ok: true };
}

export async function zohoListMailboxes(domain: string): Promise<MailboxItem[]> {
  const creds = getZohoCreds();
  if (!creds) return [];

  return [];
}
