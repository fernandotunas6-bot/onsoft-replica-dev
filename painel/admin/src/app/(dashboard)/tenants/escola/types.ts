/**
 * Resposta de GET /api/saas/tenants/billing (SIGA: src/features/saas/tenant-billing.ts,
 * `loadTenantOverview`). As listas (tipos, modelos, requisitos) vêm no `catalog`.
 */
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { getSaasApiUrl } from "@/lib/ecosystem-urls"

export type Option = { id: string; label: string; hint?: string }

export interface BillingProfile {
  tenantId: string
  institutionType: string
  pricingModel: "plan" | "per_student" | "fixed"
  pricePerStudentAoa: number | null
  minBillableStudents: number
  fixedAmountAoa: number | null
  billingPeriod: "monthly" | "quarterly" | "semiannual" | "yearly"
  discountPct: number
  dueDay: number
  paymentTermsDays: number
  graceDays: number
  autoSuspend: boolean
  paymentMethods: string[]
  invoiceByEmail: boolean
  billingContactName: string | null
  billingEmail: string | null
  billingPhone: string | null
  billingNif: string | null
  billingAddress: string | null
  notes: string | null
  billingPaused: boolean
  billingPausedReason: string | null
  billingPausedUntil: string | null
  billingPausedAt: string | null
  publicReviewStatus: "not_applicable" | "pending" | "approved" | "rejected"
  publicRequirements: Record<string, boolean>
  publicOfficialCode: string | null
  publicSupervisingBody: string | null
  publicReviewedAt: string | null
  publicReviewNotes: string | null
  updatedAt: string | null
}

export interface BillingState {
  mode: "charging" | "paused" | "exempt"
  charging: boolean
  label: string
  reason: string | null
  until: string | null
}

export interface ChargeBreakdown {
  chargeable: boolean
  months: number
  billedStudents: number | null
  monthlyBase: number
  gross: number
  periodDiscountPct: number
  periodDiscount: number
  customDiscountPct: number
  customDiscount: number
  total: number
  lines: string[]
}

export interface TenantOverview {
  tenant: {
    id: string
    name: string
    slug: string
    status: string
    subscription_status: string | null
    trial_ends_at: string | null
    contact_name: string | null
    contact_email: string | null
    contact_phone: string | null
    max_students: number | null
    max_storage_gb: number | null
    billing_exempt: boolean | null
    billing_exempt_reason: string | null
    created_at: string
    plans: { name?: string; code?: string; price_aoa_monthly?: number; price_aoa_yearly?: number; max_students?: number } | null
  }
  school: {
    id: string
    name: string
    commercial_name: string | null
    nif: string | null
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    province: string | null
    municipality: string | null
    director_name: string | null
    status: string | null
    public_code: string | null
  } | null
  usage: { students: number; staff: number; storageBytes: number; calculatedAt: string | null }
  subscription: {
    status: string
    billing_period: string | null
    current_period_start: string | null
    current_period_end: string | null
    plans: { name?: string; code?: string } | null
  } | null
  domains: { hostname: string; type: string; status: string; ssl_status: string | null; verified_at: string | null }[]
  audit: { action: string; metadata: Record<string, unknown> | null; created_at: string }[]
  plans: { id: string; code: string; name: string; price_aoa_monthly: number | null; price_aoa_yearly: number | null; max_students: number | null; is_active: boolean }[]
  billing: {
    profile: BillingProfile
    stored: boolean
    tableReady: boolean
    migration: string
    suggestedInstitutionType: string | null
    state: BillingState
    charge: ChargeBreakdown
    schedule: {
      issueOn: string
      dueOn: string
      /** Fim do período pago (assinatura activa), se houver. */
      paidUntil: string | null
      /** Fim do período pago + tolerância; null sem período pago ou sem «só consulta». */
      suspendAfter: string | null
      /** Já passou a tolerância: a tarefa diária põe a escola só de consulta. */
      overdue: boolean
    }
    publicReadiness: { canApprove: boolean; missing: string[]; recommendedMissing: string[] }
    periodDiscounts: Record<string, number>
  }
  catalog: {
    institutionTypes: Option[]
    pricingModels: Option[]
    periods: (Option & { months: number; defaultDiscountPct: number })[]
    paymentMethods: Option[]
    reviewStatuses: Option[]
    publicRequirements: (Option & { required: boolean })[]
  }
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = json ? { "Content-Type": "application/json" } : {}
  if (!isSupabaseConfigured()) return headers
  const { data } = await createClient().auth.getSession()
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
  return headers
}

export async function fetchTenantOverview(tenantId: string): Promise<TenantOverview> {
  const res = await fetch(
    getSaasApiUrl(`/api/saas/tenants/billing?tenantId=${encodeURIComponent(tenantId)}`),
    { headers: await authHeaders() },
  )
  const data = (await res.json().catch(() => ({}))) as TenantOverview & { error?: string }
  if (!res.ok) throw new Error(data.error || "Não foi possível carregar a escola.")
  return data
}

export async function postBillingAction(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(getSaasApiUrl("/api/saas/tenants/billing"), {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || "Não foi possível gravar.")
}

export const kz = (value: number | null | undefined) =>
  value == null
    ? "—"
    : `${Number(value).toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`

export const dateLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("pt-AO") : "—"
