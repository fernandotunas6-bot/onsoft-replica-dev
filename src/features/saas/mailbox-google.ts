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

  // Admin SDK Directory API is not implemented. Never mark a mailbox as created.
  return { ok: false, reason: "Criação Google Workspace indisponível: falta implementar o Admin SDK." };
}

export async function googleSuspendMailbox(
  accountId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const creds = getGoogleCreds();
  if (!creds) return { ok: false, reason: "Credenciais Google Workspace em falta." };

  // A locally configured service account is not proof that suspension succeeded.
  return { ok: false, reason: "Suspensão Google Workspace indisponível: falta implementar o Admin SDK." };
}

export async function googleListMailboxes(domain: string): Promise<MailboxItem[]> {
  const creds = getGoogleCreds();
  if (!creds) return [];

  return [];
}
