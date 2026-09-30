import { getPayflowHealthUrl, getSaasApiUrl } from "@/lib/ecosystem-urls"

export interface SaasSessionProfile {
  userId: string
  email: string | null
  platformAdmin: boolean
  /** Sessão com verificação em dois passos (aal2). As rotas /api/saas/* exigem-na. */
  mfa: boolean
}

export interface SaasPlanRow {
  id: string
  name: string
  code: string
  description?: string
  price_aoa_monthly?: number
  max_students?: number
  features?: Record<string, boolean>
}

export interface PlatformAdminRow {
  user_id: string
  email: string | null
  created_at: string
}

export interface SaasAuditLogRow {
  id: string
  tenant_id: string | null
  user_id: string | null
  action: string
  entity: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  tenant_name?: string | null
  tenant_slug?: string | null
}

export interface GatewayWebhookEventRow {
  id: string
  school_id: string | null
  channel: string
  http_status: number
  ok: boolean
  message: string
  reference: string | null
  invoice_id: string | null
  amount: number | null
  created_at: string
  school_name?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
}

export interface GatewayWebhookMetrics {
  available: boolean
  summary: {
    last24h: { total: number; ok: number; failed: number }
    last7d: { total: number; ok: number; failed: number }
    byChannel: Record<string, { total24h: number; failed24h: number }>
  }
  recentFailures: GatewayWebhookEventRow[]
  schoolsWithFailures7d: Array<{
    school_id: string
    school_name: string
    tenant_slug: string | null
    failures: number
  }>
  lastRateAlert: GatewayWebhookRateAlert | null
}

export interface GatewayWebhookRateAlert {
  created_at: string
  failure_rate: number
  total_24h: number
  failed_24h: number
  reason: string
}

export interface TenantDomainRow {
  id: string
  tenant_id: string
  hostname: string
  type: "siga_subdomain" | "custom_domain"
  status: "pending" | "active" | "failed"
  ssl_status: string
  verified_at?: string
  created_at: string
  tenant_name?: string | null
  tenant_slug?: string | null
}

export interface SubscriptionRow {
  id: string
  tenant_id: string
  plan_id: string
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid"
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
  tenant_name?: string | null
  tenant_slug?: string | null
  plan_name?: string | null
  plan_code?: string | null
  price_aoa_monthly?: number | null
}

function authHeaders(accessToken: string | undefined | null, json = false): HeadersInit {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (json) headers["Content-Type"] = "application/json"
  return headers
}

export async function fetchSaasPlans(): Promise<SaasPlanRow[]> {
  try {
    const res = await fetch(getSaasApiUrl("/api/saas/plans"))
    if (!res.ok) return []
    const data = (await res.json()) as { plans?: SaasPlanRow[] }
    return data.plans ?? []
  } catch {
    return []
  }
}

export async function syncSaasUsage(accessToken: string | undefined | null): Promise<{
  ok: boolean
  updated?: number
  error?: string
}> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/usage/sync"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = (await res.json().catch(() => ({}))) as { updated?: number; error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível sincronizar." }
  return { ok: true, updated: data.updated }
}

export async function updateTenantSubscription(
  accessToken: string | undefined | null,
  input: { tenantId: string; plan_code?: string; extend_trial_days?: number },
): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/tenants/subscription"), {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível actualizar a subscrição." }
  return { ok: true }
}

export async function fetchPlatformAdmins(
  accessToken: string | undefined | null,
): Promise<{ ok: boolean; admins?: PlatformAdminRow[]; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/platform-admins"), {
    headers: authHeaders(accessToken),
  })
  const data = (await res.json().catch(() => ({}))) as { admins?: PlatformAdminRow[]; error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível listar administradores." }
  return { ok: true, admins: data.admins ?? [] }
}

export async function grantPlatformAdmin(
  accessToken: string | undefined | null,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/platform-admins"), {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ email }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível conceder acesso." }
  return { ok: true }
}

export async function revokePlatformAdmin(
  accessToken: string | undefined | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/platform-admins/revoke"), {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ userId }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível revogar acesso." }
  return { ok: true }
}

export async function fetchSaasAuditLogs(
  accessToken: string | undefined | null,
  limit = 50,
  actions: string[] = [],
): Promise<{ ok: boolean; logs?: SaasAuditLogRow[]; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const filter = actions.length ? `&actions=${encodeURIComponent(actions.join(","))}` : ""
  const res = await fetch(getSaasApiUrl(`/api/saas/audit-logs?limit=${limit}${filter}`), {
    headers: authHeaders(accessToken),
  })
  const data = (await res.json().catch(() => ({}))) as { logs?: SaasAuditLogRow[]; error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível carregar a auditoria." }
  return { ok: true, logs: data.logs ?? [] }
}

export async function fetchGatewayWebhookMetrics(
  accessToken: string | undefined | null,
  limit = 200,
): Promise<{ ok: boolean; metrics?: GatewayWebhookMetrics; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl(`/api/saas/gateway-webhooks?limit=${limit}`), {
    headers: authHeaders(accessToken),
  })
  const data = (await res.json().catch(() => ({}))) as {
    metrics?: GatewayWebhookMetrics
    error?: string
  }
  if (!res.ok) {
    return { ok: false, error: data.error || "Não foi possível carregar métricas de webhook." }
  }
  return { ok: true, metrics: data.metrics }
}

export async function fetchTenantDomains(
  accessToken: string | undefined | null,
): Promise<{ ok: boolean; domains?: TenantDomainRow[]; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/domains"), {
    headers: authHeaders(accessToken),
  })
  const data = (await res.json().catch(() => ({}))) as { domains?: TenantDomainRow[]; error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível listar domínios." }
  return { ok: true, domains: data.domains ?? [] }
}

export async function registerTenantDomain(
  accessToken: string | undefined | null,
  input: { tenantId: string; hostname: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/domains"), {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível registar domínio." }
  return { ok: true }
}

export async function updateTenantDomainStatus(
  accessToken: string | undefined | null,
  input: { domainId: string; status: "pending" | "active" | "failed" },
): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/domains/status"), {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível actualizar domínio." }
  return { ok: true }
}

export async function verifyTenantDomainDns(
  accessToken: string | undefined | null,
  domainId: string,
): Promise<{ ok: boolean; method?: "cname" | "txt"; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/domains/verify"), {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ domainId }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    method?: "cname" | "txt"
    error?: string
  }
  if (!res.ok) return { ok: false, error: data.error || "Verificação DNS falhou." }
  return { ok: true, method: data.method }
}

export async function fetchSaasSubscriptions(
  accessToken: string | undefined | null,
): Promise<{ ok: boolean; subscriptions?: SubscriptionRow[]; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/subscriptions"), {
    headers: authHeaders(accessToken),
  })
  const data = (await res.json().catch(() => ({}))) as {
    subscriptions?: SubscriptionRow[]
    error?: string
  }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível listar subscrições." }
  return { ok: true, subscriptions: data.subscriptions ?? [] }
}

export async function backfillSaasSubscriptions(
  accessToken: string | undefined | null,
): Promise<{ ok: boolean; created?: number; error?: string }> {
  if (!accessToken) return { ok: false, error: "Sessão em falta." }
  const res = await fetch(getSaasApiUrl("/api/saas/subscriptions/backfill"), {
    method: "POST",
    headers: authHeaders(accessToken),
  })
  const data = (await res.json().catch(() => ({}))) as { created?: number; error?: string }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível sincronizar." }
  return { ok: true, created: data.created ?? 0 }
}

export async function fetchSaasSession(
  accessToken: string | undefined | null,
): Promise<{ ok: true; profile: SaasSessionProfile } | { ok: false; status: number }> {
  if (!accessToken) return { ok: false, status: 401 }
  const res = await fetch(getSaasApiUrl("/api/saas/me"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return { ok: false, status: res.status }
  const data = (await res.json()) as SaasSessionProfile & { error?: string }
  return {
    ok: true,
    profile: {
      userId: data.userId,
      email: data.email ?? null,
      platformAdmin: data.platformAdmin,
      mfa: Boolean(data.mfa),
    },
  }
}

export interface MailboxRow {
  id: string
  tenant_id: string
  email: string
  display_name: string
  provider: string
  status: string
  created_at: string
  tenants?: { name: string; slug: string }
}

export async function fetchTenantMailboxes(token: string, tenantId?: string): Promise<{ ok: boolean; mailboxes?: MailboxRow[]; error?: string }> {
  try {
    const url = new URL(getSaasApiUrl("/api/saas/mailboxes"))
    if (tenantId) url.searchParams.set("tenantId", tenantId)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return { ok: false, error: "Failed to fetch mailboxes" }
    const data = await res.json()
    return { ok: true, mailboxes: data.mailboxes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

export type PayflowPublicHealth = {
  service: string
  status: string
  runtime?: {
    mode?: string
    integrationConfigured?: boolean
    ssoConfigured?: boolean
    bankConnectorConfigured?: boolean
    sigaSettlementConfigured?: boolean
    emisHomologated?: boolean
    sandboxEnabled?: boolean
  }
}

/** Health público do PayFlow — sem propinas nem dados de escola. */
export async function fetchPayflowPublicHealth(): Promise<
  { ok: true; health: PayflowPublicHealth } | { ok: false; error: string }
> {
  try {
    const res = await fetch(getPayflowHealthUrl(), { cache: "no-store" })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = (await res.json()) as { data?: PayflowPublicHealth }
    if (!json.data || json.data.service !== "payflow") {
      return { ok: false, error: "Resposta inesperada do PayFlow." }
    }
    return { ok: true, health: json.data }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "PayFlow indisponível.",
    }
  }
}
