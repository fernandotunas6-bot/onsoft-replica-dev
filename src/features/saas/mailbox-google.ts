import type { MailboxConfig, MailboxProvisionResult, MailboxItem } from "./mailbox-providers";

/**
 * mailbox-google.ts
 * Integração com Google Workspace (Admin SDK Directory API)
 */

function getGoogleCreds() {
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!domain || !key) return null;
  return { domain, key };
}

export async function googleCreateMailbox(config: MailboxConfig): Promise<MailboxProvisionResult> {
  const creds = getGoogleCreds();
  if (!creds) return { ok: false, reason: "Credenciais Google Workspace em falta." };

  // A chamada à Admin SDK ainda não está implementada. Responder "ok" aqui
  // registava uma caixa de correio que não existe no Google.
  return {
    ok: false,
    reason: "Criação de caixas Google Workspace ainda não está implementada.",
  };
}

export async function googleSuspendMailbox(
  accountId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const creds = getGoogleCreds();
  if (!creds) return { ok: false, reason: "Credenciais Google Workspace em falta." };

  return { ok: false, reason: "Suspensão de caixas Google Workspace ainda não está implementada." };
}

export async function googleListMailboxes(domain: string): Promise<MailboxItem[]> {
  const creds = getGoogleCreds();
  if (!creds) return [];

  return [];
}
