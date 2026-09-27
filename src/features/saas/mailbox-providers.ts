/**
 * mailbox-providers.ts (server-side only)
 *
 * Orquestrador de provisionamento de caixas de correio profissionais.
 * O SIGA chama APIs de providers (Zoho, Google Workspace) para criar contas
 * para as escolas. O provider é definido por MAILBOX_PROVIDER.
 */

export type MailboxProvider = "zoho" | "google" | "simulated";

export type MailboxConfig = {
  tenantId: string;
  tenantSlug: string;
  email: string; // ex: admin@colegio.ao
  displayName: string; // ex: Colégio Esperança
  password?: string; // se não for fornecida, o provider pode gerar ou enviar link
};

export type MailboxProvisionResult =
  | { ok: true; providerAccountId?: string; provider: MailboxProvider }
  | { ok: false; reason: string };

export type MailboxItem = {
  email: string;
  displayName: string;
  status: "active" | "suspended";
  providerAccountId: string;
};

const isProduction = () => process.env.NODE_ENV === "production";

export function resolveMailboxProvider(): MailboxProvider {
  const provider = (process.env.MAILBOX_PROVIDER || "simulated").toLowerCase();
  if (provider === "zoho" || provider === "google") {
    return provider as MailboxProvider;
  }
  return "simulated";
}

// Stubs para providers reais (implementados noutros ficheiros)
import { zohoCreateMailbox, zohoSuspendMailbox, zohoListMailboxes } from "./mailbox-zoho";
import { googleCreateMailbox, googleSuspendMailbox, googleListMailboxes } from "./mailbox-google";

export async function createMailbox(config: MailboxConfig): Promise<MailboxProvisionResult> {
  const provider = resolveMailboxProvider();

  try {
    if (provider === "zoho") {
      return await zohoCreateMailbox(config);
    }
    if (provider === "google") {
      return await googleCreateMailbox(config);
    }

    // Simulado só fora de produção: em produção, responder "ok" registava como
    // activa uma caixa de correio que não existe em lado nenhum.
    if (isProduction()) {
      return {
        ok: false,
        reason:
          "Nenhum fornecedor de e-mail configurado (MAILBOX_PROVIDER). A caixa não foi criada.",
      };
    }
    console.log(`[SIMULATED] A criar mailbox para ${config.email}`);
    return { ok: true, provider: "simulated", providerAccountId: `sim-${Date.now()}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function suspendMailbox(
  providerAccountId: string,
  provider: MailboxProvider,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (provider === "zoho") {
      return await zohoSuspendMailbox(providerAccountId);
    }
    if (provider === "google") {
      return await googleSuspendMailbox(providerAccountId);
    }

    if (isProduction()) {
      return { ok: false, reason: "Nenhum fornecedor de e-mail configurado (MAILBOX_PROVIDER)." };
    }
    console.log(`[SIMULATED] A suspender mailbox ${providerAccountId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function listMailboxes(
  domain: string,
  provider: MailboxProvider,
): Promise<MailboxItem[]> {
  try {
    if (provider === "zoho") {
      return await zohoListMailboxes(domain);
    }
    if (provider === "google") {
      return await googleListMailboxes(domain);
    }

    // Default: Simulated
    return [];
  } catch (error) {
    console.error(`Falha ao listar mailboxes (${provider}):`, error);
    return [];
  }
}
