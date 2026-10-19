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
  /** Níveis que a escola lecciona (ids de TEACHING_LEVELS). */
  teaching_levels?: string[]
  /** Cursos do II Ciclo (ids de SECONDARY_COURSES), só com ii_ciclo. */
  secondary_courses?: string[]
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
  /** Comprovativo devolvido por verifySignupEmailCode — o servidor recusa o registo sem ele. */
  email_verification_token?: string
  session_id?: string
  /** hCaptcha (quando o build tem VITE_HCAPTCHA_SITE_KEY). */
  captcha_token?: string
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

/**
 * true = livre para usar, false = já pertence a outra escola, "reserved" = reservado pela
 * plataforma, null = não deu para confirmar (não bloqueia o avanço).
 */
export async function checkSlugAvailability(slug: string): Promise<boolean | "reserved" | null> {
  try {
    const res = await fetch(getSaasApiUrl(`/api/saas/tenants/lookup?slug=${encodeURIComponent(slug)}`))
    if (res.status === 404) return true
    if (res.status === 409) return "reserved"
    if (res.ok) return false
    return null
  } catch {
    return null
  }
}

export async function signupSchool(payload: SchoolSignupPayload): Promise<{
  ok: boolean
  error?: string
  /** Erros de validação do servidor, por campo do formulário. */
  fieldErrors?: Record<string, string[]>
  tenantId?: string
  slug?: string
  hostname?: string
  sigaUrl?: string
  adminTenantsUrl?: string
  adminInviteDelivered?: boolean
  adminPasswordSet?: boolean
  adminExistingAccount?: boolean
  /** Entrada directa no painel da escola, já com sessão. Uso único. */
  adminLoginUrl?: string | null
}> {
  const res = await fetch(getSaasApiUrl("/api/saas/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    issues?: Record<string, string[]>
    tenantId?: string
    slug?: string
    hostname?: string
    sigaUrl?: string
    adminTenantsUrl?: string
    adminInviteDelivered?: boolean
    adminPasswordSet?: boolean
    adminExistingAccount?: boolean
    adminLoginUrl?: string | null
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || "Não foi possível criar a escola.",
      fieldErrors: data.issues,
    }
  }
  return {
    ok: true,
    tenantId: data.tenantId,
    slug: data.slug,
    hostname: data.hostname,
    sigaUrl: data.sigaUrl || ECOSYSTEM_URLS.siga,
    adminTenantsUrl: data.adminTenantsUrl,
    adminInviteDelivered: data.adminInviteDelivered ?? false,
    adminPasswordSet: data.adminPasswordSet ?? false,
    adminExistingAccount: data.adminExistingAccount ?? false,
    adminLoginUrl: data.adminLoginUrl ?? null,
  }
}

async function postJson<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(getSaasApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  return { ok: res.ok, status: res.status, data }
}

/** Envia o código de 6 dígitos para o e-mail do administrador. */
export async function requestSignupEmailCode(email: string, sessionId: string) {
  try {
    const { ok, data } = await postJson<{ cooldownSeconds?: number }>("/api/saas/signup/email-code", {
      email,
      session_id: sessionId,
    })
    return ok
      ? { ok: true as const, cooldownSeconds: data.cooldownSeconds ?? 60 }
      : { ok: false as const, error: data.error || "Não foi possível enviar o código.", cooldownSeconds: data.cooldownSeconds ?? 0 }
  } catch {
    return { ok: false as const, error: "Sem ligação ao servidor. Tente de novo.", cooldownSeconds: 0 }
  }
}

/** Confirma o código; devolve o comprovativo que o registo exige. */
export async function verifySignupEmailCode(input: {
  email: string
  code: string
  sessionId: string
  contactName?: string
  contactPhone?: string
  schoolName?: string
  planCode?: PlanCode
}) {
  try {
    const { ok, data } = await postJson<{ token?: string }>("/api/saas/signup/email-verify", {
      email: input.email,
      code: input.code,
      session_id: input.sessionId,
      contact_name: input.contactName || undefined,
      contact_phone: input.contactPhone || undefined,
      school_name: input.schoolName || undefined,
      plan_code: input.planCode,
    })
    return ok && data.token
      ? { ok: true as const, token: data.token }
      : { ok: false as const, error: data.error || "Código incorrecto." }
  } catch {
    return { ok: false as const, error: "Sem ligação ao servidor. Tente de novo." }
  }
}

/**
 * Passo atingido no assistente (sem dados pessoais), para a equipa ver onde as
 * escolas desistem. Nunca atrapalha o registo: erros são ignorados.
 */
export function recordSignupProgress(input: {
  sessionId: string
  step: number
  planCode?: PlanCode
  schoolName?: string
}) {
  void postJson("/api/saas/signup/progress", {
    session_id: input.sessionId,
    step: input.step,
    plan_code: input.planCode,
    school_name: input.schoolName?.trim() || undefined,
  }).catch(() => undefined)
}
