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
  nif?: string
  address?: string
  city?: string
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
