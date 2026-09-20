/**
 * email-routing.ts  (server-side only)
 *
 * Fase 3 — Encaminhamento de e-mail institucional do SIGA Plus.
 * Suporta Cloudflare Email Routing (quando configurado) com graceful
 * degradation para modo simulado quando as credenciais não estão presentes.
 *
 * Tabela de persistência: `school_email_routes` (criada em APPLY_DIGITAL_IDENTITY.sql)
 */

import { getPlatformDomain } from "@/lib/saas/platform-domain";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type EmailRouteConfig = {
  institutionalAddress: string; // ex: esperanca@siga.ao
  forwardTo: string; // ex: direcao@gmail.com
  tenantSlug: string;
  tenantId: string;
};

export type EmailRouteResult =
  | { ok: true; routeId?: string; provider: "cloudflare" | "simulated" }
  | { ok: false; reason: string };

export type EmailRouteItem = {
  id: string;
  name: string;
  enabled: boolean;
  matchers: { field: string; type: string; value: string }[];
  actions: { type: string; value: string[] }[];
};

export type CloudflareCredentials = {
  accountId: string;
  zoneId: string;
  apiToken: string;
};

// ─── Utilitários públicos ────────────────────────────────────────────────────

/**
 * Constrói o endereço de e-mail institucional para um dado slug e domínio.
 */
export function buildInstitutionalAddress(slug: string, platformDomain?: string): string {
  const domain = platformDomain ?? getPlatformDomain();
  return `${slug.trim().toLowerCase()}@${domain}`;
}

/**
 * Valida se um e-mail de encaminhamento tem formato básico válido.
 */
export function validateForwardingEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1) return false;
  const domain = trimmed.slice(atIndex + 1);
  return domain.includes(".") && domain.length >= 3;
}

/**
 * Resolve as credenciais Cloudflare a partir das variáveis de ambiente.
 * Retorna null se qualquer credencial estiver em falta.
 */
export function resolveCloudflareCredentials(): CloudflareCredentials | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() ?? "";
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  if (!accountId || !zoneId || !apiToken) return null;
  return { accountId, zoneId, apiToken };
}

// ─── Cloudflare Email Routing API ───────────────────────────────────────────

async function callCloudflareCreateRoute(
  creds: CloudflareCredentials,
  config: EmailRouteConfig,
): Promise<{ ok: true; routeId: string } | { ok: false; reason: string }> {
  try {
    const body = {
      name: `SIGA-${config.tenantSlug}`,
      enabled: true,
      matchers: [{ field: "to", type: "literal", value: config.institutionalAddress }],
      actions: [{ type: "forward", value: [config.forwardTo] }],
    };

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${creds.zoneId}/email/routing/rules`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const json = (await response.json()) as {
      success: boolean;
      result?: { tag?: string; id?: string };
      errors?: { message: string }[];
    };

    if (!json.success) {
      const msg = json.errors?.map((e) => e.message).join("; ") ?? "Erro Cloudflare desconhecido.";
      return { ok: false, reason: msg };
    }

    const routeId = json.result?.tag ?? json.result?.id ?? "";
    return { ok: true, routeId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Falha na chamada Cloudflare: ${message}` };
  }
}

export async function listEmailRoutes(zoneId: string, apiToken: string): Promise<EmailRouteItem[]> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );
    const json = (await response.json()) as {
      success: boolean;
      result?: EmailRouteItem[];
    };
    if (!json.success) return [];
    return json.result ?? [];
  } catch {
    return [];
  }
}

export async function deleteEmailRoute(
  routeId: string,
  zoneId: string,
  apiToken: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules/${routeId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );
    const json = (await response.json()) as { success: boolean; errors?: { message: string }[] };
    if (!json.success) {
      return { ok: false, reason: json.errors?.map((e) => e.message).join("; ") };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Cria a rota de encaminhamento de e-mail institucional.
 *
 * Fluxo:
 * 1. Validações básicas (e-mail destino).
 * 2. Se credenciais Cloudflare presentes → cria regra na API real.
 * 3. Se não → retorna mode=simulated (graceful degradation).
 * 4. Persiste em school_email_routes (Supabase).
 */
export async function createEmailRoute(config: EmailRouteConfig): Promise<EmailRouteResult> {
  if (!validateForwardingEmail(config.forwardTo)) {
    return { ok: false, reason: "E-mail de encaminhamento inválido." };
  }
  if (!validateForwardingEmail(config.institutionalAddress)) {
    return { ok: false, reason: "Endereço institucional inválido." };
  }

  const creds = resolveCloudflareCredentials();
  let routeId: string | undefined;
  let provider: "cloudflare" | "simulated" = "simulated";

  if (creds) {
    const cfResult = await callCloudflareCreateRoute(creds, config);
    if (cfResult.ok) {
      routeId = cfResult.routeId;
      provider = "cloudflare";
    } else {
      // Cloudflare falhou mas não bloqueamos — graceful degradation
      console.warn("[SIGA] Email Routing Cloudflare falhou:", cfResult.reason);
    }
  }

  // Persistir em Supabase.
  //
  // A tabela é indexada por `school_id` e os endereços chamam-se `source_address` e
  // `destination_address` — até 2026-09-16 este upsert usava `tenant_id`,
  // `institutional_address`, `forward_to` e `active`, nomes que a tabela nunca teve, e o
  // PostgREST recusava-o inteiro. O `catch` transformava isso num aviso no log: a rota
  // era criada na Cloudflare e desaparecia do registo.
  try {
    const db = await loadSgaAdminClient();

    // `config.tenantId` é do TENANT; a escola é que é a chave desta tabela.
    const { data: school } = await db
      .from("schools")
      .select("id")
      .eq("tenant_id", config.tenantId)
      .maybeSingle();

    if (!school?.id) {
      console.error("[SIGA] Email route sem escola para o tenant:", config.tenantId);
    } else {
      await db.from("school_email_routes").upsert(
        {
          school_id: school.id as string,
          source_address: config.institutionalAddress,
          destination_address: config.forwardTo,
          cloudflare_route_id: routeId ?? null,
          provider,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "school_id,source_address" },
      );
    }
  } catch (err) {
    // Não falha o pedido por erro de persistência — log e continua
    console.error("[SIGA] Falha ao persistir email route:", err);
  }

  return { ok: true, routeId, provider };
}
