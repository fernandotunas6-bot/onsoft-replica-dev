import { getSaasApiUrl, ECOSYSTEM_URLS } from "@/lib/ecosystem-urls"

export type PlanCode = "start" | "professional" | "business" | "enterprise"

export interface SaasPlan {
  id?: string
  name: string
  code: PlanCode
  description?: string
  price_aoa_monthly?: number
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
  website?: string
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
  }
  if (!res.ok) return { ok: false, error: data.error || "Não foi possível criar a escola." }
  return {
    ok: true,
    tenantId: data.tenantId,
    slug: data.slug,
    hostname: data.hostname,
    sigaUrl: data.sigaUrl || ECOSYSTEM_URLS.siga,
    adminTenantsUrl: data.adminTenantsUrl,
  }
}
