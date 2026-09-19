/**
 * domain-polling.ts  (server-side only)
 *
 * Fase 4 — Polling periódico de verificação DNS para domínios personalizados.
 * Controla as tentativas e intervalos de verificação DNS.
 * A tabela de estado vive em `tenant_domains` e `tenant_provisioning`.
 */

import { verifyCustomDomainDns } from "@/features/saas/domain-verify";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type DomainPollState = {
  domainId: string;
  hostname: string;
  tenantSlug: string;
  tenantId: string;
  status: "pending" | "active" | "failed";
  lastCheckedAt: string | null;
  checkCount: number;
};

export type PollResult =
  | { status: "active"; method: "cname" | "txt"; checkedAt: string }
  | { status: "pending"; reason: string; checkedAt: string }
  | { status: "failed"; reason: string; checkedAt: string };

// ─── Lógica de intervalo ─────────────────────────────────────────────────────

/**
 * Determina se deve tentar verificação novamente.
 * - Nunca re-verifica um domínio já activo.
 * - Para após `maxAttempts` tentativas (default: 48 ≈ 24h a intervalos de 30min médio).
 */
export function shouldRetryCheck(state: DomainPollState, maxAttempts = 48): boolean {
  if (state.status === "active") return false;
  if (state.checkCount >= maxAttempts) return false;
  return true;
}

/**
 * Calcula o delay (ms) até à próxima verificação com backoff progressivo:
 * - Tentativas 1-5:   30 segundos (rápido — utilizador à espera no UI)
 * - Tentativas 6-12:  2 minutos
 * - Tentativas 13+:   10 minutos (modo background)
 */
export function calculateNextCheckDelay(checkCount: number): number {
  if (checkCount <= 5) return 30_000; // 30s
  if (checkCount <= 12) return 120_000; // 2min
  return 600_000; // 10min
}

// ─── Verificação DNS ─────────────────────────────────────────────────────────

/**
 * Executa uma tentativa de verificação DNS para o domínio personalizado.
 * Nunca lança excepção — sempre retorna um PollResult.
 */
export async function pollCustomDomainDns(state: DomainPollState): Promise<PollResult> {
  const checkedAt = new Date().toISOString();

  if (state.status === "active") {
    return { status: "active", method: "cname", checkedAt };
  }

  try {
    const result = await verifyCustomDomainDns(state.hostname, state.tenantSlug, state.tenantId);

    if (result.ok) {
      return { status: "active", method: result.method, checkedAt };
    }

    // Após muitas tentativas falhadas → marca como failed
    if (state.checkCount >= 48) {
      return { status: "failed", reason: result.reason, checkedAt };
    }

    return { status: "pending", reason: result.reason, checkedAt };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Erro de rede na verificação DNS.";
    if (state.checkCount >= 48) {
      return { status: "failed", reason, checkedAt };
    }
    return { status: "pending", reason, checkedAt };
  }
}

// ─── Persistência ────────────────────────────────────────────────────────────

/**
 * Persiste o resultado de uma verificação DNS em `tenant_domains`
 * e actualiza `tenant_provisioning.dns_status` se a tabela existir.
 */
export async function persistPollResult(domainId: string, result: PollResult): Promise<void> {
  const db = await loadSgaAdminClient();

  const domainUpdate: Record<string, unknown> = {
    last_checked_at: result.checkedAt,
    updated_at: result.checkedAt,
  };

  if (result.status === "active") {
    domainUpdate.status = "active";
    domainUpdate.ssl_status = "active";
    domainUpdate.verified_at = result.checkedAt;
  } else if (result.status === "failed") {
    domainUpdate.status = "failed";
  }

  const { data: domain } = await db
    .from("tenant_domains")
    .update(domainUpdate)
    .eq("id", domainId)
    .select("tenant_id")
    .maybeSingle();

  // Reflectir o resultado em `tenant_provisioning`. Duas correcções a 2026-09-16: a coluna
  // é `domain_status`, não `dns_status`, e a tabela é indexada por `school_id` — não tem
  // `tenant_id`. O domínio conhece o tenant; a escola é que faz a ponte
  // (`tenant_domains.tenant_id` → `schools.tenant_id` → `schools.id`). Enquanto isto esteve
  // errado, o estado do domínio nunca chegou ao painel de aprovisionamento.
  if (domain?.tenant_id) {
    const domainStatus =
      result.status === "active" ? "verified" : result.status === "failed" ? "failed" : "pending";

    const { data: school } = await db
      .from("schools")
      .select("id")
      .eq("tenant_id", domain.tenant_id as string)
      .maybeSingle();

    if (school?.id) {
      await db
        .from("tenant_provisioning")
        .update({
          domain_status: domainStatus,
          updated_at: result.checkedAt,
        })
        .eq("school_id", school.id as string);
    }
  }
}
