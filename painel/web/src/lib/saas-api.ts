import { getSaasApiUrl, ECOSYSTEM_URLS } from "@/lib/ecosystem-urls"

export type PlanCode = "start" | "professional" | "business" | "enterprise"

export interface SaasPlan {
  id?: string
  name: string
  code: PlanCode
  description?: string
  price_aoa_monthly?: number
  price_aoa_yearly?: number
  max_students?: number
  max_staff?: number
  max_storage_gb?: number
}

export interface SchoolSignupPayload {
  name: string
  commercial_name?: string
  /** Obrigatório no servidor: sem NIF a exportação SAF-T para a AGT não é gerada. */
  nif: string
  address?: string
  city?: string
  province?: string
  municipality?: string
  commune?: string
  neighborhood?: string
  school_type?: string
  institution?: { levels: string[]; shifts: string[]; rooms: number }
  phone?: string
  email?: string
  contact_name: string
  contact_role?: string
  contact_phone?: string
  contact_email: string
  plan_code: PlanCode
  slug: string
  admin_email: string
  admin_name: string
  admin_password: string
  website?: string
}

export function formatAoaPrice(value?: number | null): string | null {
  if (value == null) return null
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(value)
}

/** Diferenciadores honestos entre planos: só o que o sistema de facto aplica (limites), não promessas de features. */
export function planLimitFeatures(plan: SaasPlan): string[] {
  const items: string[] = []
  if (plan.max_students) items.push(`Até ${plan.max_students.toLocaleString("pt-AO")} alunos`)
  if (plan.max_staff) items.push(`Até ${plan.max_staff.toLocaleString("pt-AO")} funcionários`)
  if (plan.max_storage_gb) items.push(`${plan.max_storage_gb} GB de armazenamento`)
  items.push("Académico, financeiro, documentos e frequência")
  // Espelha o gate real do servidor (src/features/saas/plan-features.ts) — só
  // aparece aqui o que o SIGA de facto liga/desliga por plano, não promessa.
  if (plan.code === "business" || plan.code === "enterprise") {
    items.push("Domínio próprio e e-mail profissional")
  }
  if (plan.code === "enterprise") {
    items.push("Identidade visual avançada (logótipo e cores)")
  }
  return items
}

export async function fetchSaasPlans(): Promise<SaasPlan[]> {
  try {
    const res = await fetch(getSaasApiUrl("/api/saas/plans"))
    if (!res.ok) return []
    const data = (await res.json()) as { plans?: SaasPlan[] }
    return data.plans ?? []
  } catch {
    return []
  }
}

/** true = livre para usar, false = já pertence a outra escola, null = não deu para confirmar (não bloqueia o avanço). */
export async function checkSlugAvailability(slug: string): Promise<boolean | null> {
  try {
    const res = await fetch(getSaasApiUrl(`/api/saas/tenants/lookup?slug=${encodeURIComponent(slug)}`))
    if (res.status === 404) return true
    if (res.ok) return false
    return null
  } catch {
    return null
  }
}

export async function signupSchool(payload: SchoolSignupPayload): Promise<{
  ok: boolean
  error?: string
  tenantId?: string
  slug?: string
  hostname?: string
  sigaUrl?: string
  adminTenantsUrl?: string
  adminInviteDelivered?: boolean
  adminPasswordSet?: boolean
}> {
  const res = await fetch(getSaasApiUrl("/api/saas/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    tenantId?: string
    slug?: string
    hostname?: string
    sigaUrl?: string
    adminTenantsUrl?: string
    adminInviteDelivered?: boolean
    adminPasswordSet?: boolean
  }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível criar a escola." }
  return {
    ok: true,
    tenantId: data.tenantId,
    slug: data.slug,
    hostname: data.hostname,
    sigaUrl: data.sigaUrl || ECOSYSTEM_URLS.siga,
    adminTenantsUrl: data.adminTenantsUrl,
    adminInviteDelivered: data.adminInviteDelivered ?? false,
    adminPasswordSet: data.adminPasswordSet ?? false,
  }
}
