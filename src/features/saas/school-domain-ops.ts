/**
 * school-domain-ops.ts  (server-side only)
 *
 * Operações de domínio e e-mail pelo lado da escola (sem privilégio platform admin).
 * Usa o tenant_id do contexto de sessão para garantir isolamento.
 */

import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import {
  getPlatformDomain,
  getPlatformSubdomain,
} from "@/lib/saas/platform-domain";
import { domainDnsInstructions } from "@/features/saas/platform-ops";
import {
  buildInstitutionalAddress,
  validateForwardingEmail,
} from "@/features/saas/email-routing";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type SubdomainInfo = {
  hostname: string;
  status: "active";
};

export type CustomDomainInfo = {
  domainId: string;
  hostname: string;
  status: "pending" | "active" | "failed";
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  checkCount: number;
  instructions: ReturnType<typeof domainDnsInstructions>;
};

export type EmailRouteInfo = {
  institutionalEmail: string;
  forwardTo: string | null;
  active: boolean;
  provider: string | null;
};

export type BrandingInfo = {
  primaryColor: string | null;
  secondaryColor: string | null;
  portalTitle: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
};

export type MailboxInfo = {
  email: string;
  status: "active" | "suspended" | "deleted";
  provider: string;
};

export type SchoolDomainStatus = {
  subdomain: SubdomainInfo;
  customDomain: CustomDomainInfo | null;
  emailRoute: EmailRouteInfo | null;
  mailbox: MailboxInfo | null;
  branding: BrandingInfo | null;
};

// ─── Consultas ───────────────────────────────────────────────────────────────

/**
 * Retorna o estado completo de identidade digital de uma escola:
 * subdomínio SIGA, domínio personalizado (se existir) e rota de e-mail.
 */
export async function getSchoolDomainStatus(
  tenantId: string,
  tenantSlug: string,
): Promise<SchoolDomainStatus> {
  const db = await loadSgaAdminClient();

  // Procurar o school_id a partir do tenantId
  const { data: schoolRow } = await db.from("schools").select("id").eq("tenant_id", tenantId).maybeSingle();
  const schoolId = schoolRow?.id;

  // Subdomínio permanente (sempre activo)
  const subdomain: SubdomainInfo = {
    hostname: getPlatformSubdomain(tenantSlug),
    status: "active",
  };

  // Domínio personalizado
  const { data: customDomainRow } = await db
    .from("tenant_domains")
    .select(
      "id, hostname, status, verified_at, last_checked_at, check_count",
    )
    .eq("tenant_id", tenantId)
    .eq("type", "custom_domain")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let customDomain: CustomDomainInfo | null = null;
  if (customDomainRow) {
    const hostname = String(customDomainRow.hostname);
    customDomain = {
      domainId: customDomainRow.id as string,
      hostname,
      status: (customDomainRow.status ?? "pending") as CustomDomainInfo["status"],
      verifiedAt: (customDomainRow.verified_at ?? null) as string | null,
      lastCheckedAt: (customDomainRow.last_checked_at ?? null) as string | null,
      checkCount: (customDomainRow.check_count ?? 0) as number,
      instructions: domainDnsInstructions(hostname, tenantSlug, tenantId),
    };
  }

  // E-mail institucional
  const { data: emailRouteRow } = await db
    .from("school_email_routes")
    .select("source_address, destination_address, status, provider")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let emailRoute: EmailRouteInfo | null = null;
  if (emailRouteRow) {
    emailRoute = {
      institutionalEmail: String(emailRouteRow.source_address ?? buildInstitutionalAddress(tenantSlug)),
      forwardTo: (emailRouteRow.destination_address ?? null) as string | null,
      active: emailRouteRow.status === 'active',
      provider: (emailRouteRow.provider ?? null) as string | null,
    };
  } else {
    // Placeholder com endereço default mesmo sem rota configurada
    emailRoute = {
      institutionalEmail: buildInstitutionalAddress(tenantSlug),
      forwardTo: null,
      active: false,
      provider: null,
    };
  }

  // Caixa de Correio (Fase 5)
  const { data: mailboxRow } = await db
    .from("tenant_mailboxes")
    .select("email, status, provider")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let mailbox: MailboxInfo | null = null;
  if (mailboxRow) {
    mailbox = {
      email: String(mailboxRow.email),
      status: (mailboxRow.status || "active") as MailboxInfo["status"],
      provider: String(mailboxRow.provider || "simulated"),
    };
  }

  // Branding Institucional
  const { data: brandingRow } = await db
    .from("school_branding")
    .select("primary_color, secondary_color, portal_title, logo_url, favicon_url")
    .eq("school_id", schoolId)
    .maybeSingle();

  let branding: BrandingInfo | null = null;
  if (brandingRow) {
    branding = {
      primaryColor: (brandingRow.primary_color ?? null) as string | null,
      secondaryColor: (brandingRow.secondary_color ?? null) as string | null,
      portalTitle: (brandingRow.portal_title ?? null) as string | null,
      logoUrl: (brandingRow.logo_url ?? null) as string | null,
      faviconUrl: (brandingRow.favicon_url ?? null) as string | null,
    };
  }

  return { subdomain, customDomain, emailRoute, mailbox, branding };
}

// ─── Mutações ────────────────────────────────────────────────────────────────

/**
 * Regista um pedido de domínio personalizado e retorna as instruções DNS.
 * Se já existir um registo para este tenant, actualiza o hostname.
 */
export async function requestCustomDomainVerification(input: {
  tenantId: string;
  tenantSlug: string;
  hostname: string;
}): Promise<{ domainId: string; instructions: ReturnType<typeof domainDnsInstructions> }> {
  const db = await loadSgaAdminClient();
  const hostname = input.hostname.trim().toLowerCase();

  // Verificar se já existe para este tenant
  const { data: existing } = await db
    .from("tenant_domains")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("type", "custom_domain")
    .limit(1)
    .maybeSingle();

  let domainId: string;

  if (existing?.id) {
    domainId = existing.id as string;
    await db
      .from("tenant_domains")
      .update({
        hostname,
        status: "pending",
        verified_at: null,
        check_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domainId);
  } else {
    const { data: inserted, error } = await db
      .from("tenant_domains")
      .insert({
        tenant_id: input.tenantId,
        hostname,
        type: "custom_domain",
        status: "pending",
        check_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !inserted) {
      throw new Error(`Não foi possível registar o domínio: ${error?.message ?? "erro desconhecido"}`);
    }
    domainId = inserted.id as string;
  }

  return {
    domainId,
    instructions: domainDnsInstructions(hostname, input.tenantSlug, input.tenantId),
  };
}

/**
 * Guarda a rota de encaminhamento de e-mail institucional para a escola.
 * Não chama a API Cloudflare — isso é feito pelo endpoint REST separado.
 */
export async function saveEmailForwardingRoute(input: {
  tenantId: string;
  tenantSlug: string;
  forwardTo: string;
}): Promise<{ ok: boolean; institutionalEmail: string; reason?: string }> {
  if (!validateForwardingEmail(input.forwardTo)) {
    return { ok: false, institutionalEmail: "", reason: "E-mail de encaminhamento inválido." };
  }

  const institutionalEmail = buildInstitutionalAddress(
    input.tenantSlug,
    getPlatformDomain(),
  );

  const db = await loadSgaAdminClient();
  
  // Buscar schoolId
  const { data: schoolRow } = await db.from("schools").select("id").eq("tenant_id", input.tenantId).maybeSingle();
  if (!schoolRow) return { ok: false, institutionalEmail: "", reason: "Escola não encontrada para este tenant." };
  
  const { error } = await db.from("school_email_routes").upsert(
    {
      school_id: schoolRow.id,
      source_address: institutionalEmail,
      destination_address: input.forwardTo,
      status: 'active',
      provider: "simulated",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "school_id,source_address" },
  );

  if (error) {
    return { ok: false, institutionalEmail, reason: error.message };
  }

  return { ok: true, institutionalEmail };
}


export async function saveSchoolBranding(input: {
  tenantId: string;
  primaryColor?: string;
  secondaryColor?: string;
  portalTitle?: string;
  logoUrl?: string;
  faviconUrl?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const db = await loadSgaAdminClient();
  
  const { data: schoolRow } = await db.from("schools").select("id").eq("tenant_id", input.tenantId).maybeSingle();
  if (!schoolRow) return { ok: false, reason: "Escola não encontrada para este tenant." };

  const { error } = await db.from("school_branding").upsert(
    {
      school_id: schoolRow.id,
      ...(input.primaryColor && { primary_color: input.primaryColor }),
      ...(input.secondaryColor && { secondary_color: input.secondaryColor }),
      ...(input.portalTitle && { portal_title: input.portalTitle }),
      ...(input.logoUrl && { logo_url: input.logoUrl }),
      ...(input.faviconUrl && { favicon_url: input.faviconUrl }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "school_id" }
  );

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}
