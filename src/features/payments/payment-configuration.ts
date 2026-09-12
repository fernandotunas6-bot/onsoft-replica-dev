/**
 * Payment Configuration
 * Cada escola tem sua própria configuração de pagamentos AppyPay
 * SIGA Plus (SaaS) tem configuração master para planos
 */

import { z } from 'zod'

/**
 * Tipos de mercado de pagamento
 */
export const paymentMarketTypes = ['school_tuition', 'siga_plus_plans'] as const
export type PaymentMarketType = (typeof paymentMarketTypes)[number]

/**
 * Schema para configuração de pagamento de uma escola
 */
export const schoolPaymentConfigSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  provider: z.literal('appypay'),
  marketType: z.enum(paymentMarketTypes),
  // Credenciais AppyPay da escola
  appyPayMerchantId: z.string(),
  appyPayBearerToken: z.string(),
  appyPayWebhookSecret: z.string(),
  // Aplicações de pagamento habilitadas para esta escola
  enabledApplicationIds: z.array(z.string().uuid()),
  // Configurações de roteamento
  defaultApplicationId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type SchoolPaymentConfig = z.infer<typeof schoolPaymentConfigSchema>

/**
 * Schema para plano SaaS com método de pagamento
 */
export const saasPaymentPlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  // Preço
  amount: z.number().positive(),
  currency: z.enum(['AOA', 'USD', 'EUR']).default('AOA'),
  billingCycle: z.enum(['monthly', 'quarterly', 'annually']),
  // Método de pagamento (AppyPay application)
  paymentApplicationId: z.string().uuid(),
  paymentProvider: z.literal('appypay'),
  // Features do plano
  features: z.array(z.string()),
  maxStudents: z.number().positive().optional(),
  maxStaff: z.number().positive().optional(),
  maxModules: z.number().positive().optional(),
  // Status
  isActive: z.boolean().default(true),
  isPublished: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type SaasPaymentPlan = z.infer<typeof saasPaymentPlanSchema>

/**
 * Schema para subscrição a plano (uma escola pagando por um plano)
 */
export const schoolPlanSubscriptionSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  planId: z.string().uuid(),
  // Período
  startDate: z.date(),
  endDate: z.date(),
  // Pagamento
  status: z.enum([
    'pending_payment',
    'active',
    'suspended',
    'cancelled',
    'expired',
  ]),
  lastPaymentDate: z.date().optional(),
  nextBillingDate: z.date(),
  // Transação
  lastTransactionId: z.string().optional(),
  failureReason: z.string().optional(),
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type SchoolPlanSubscription = z.infer<typeof schoolPlanSubscriptionSchema>

/**
 * Resolver configuração de pagamento de uma escola
 * Implementa multi-tenant isolamento
 */
export async function getSchoolPaymentConfig(
  db: any,
  schoolId: string,
  marketType: PaymentMarketType,
): Promise<SchoolPaymentConfig | null> {
  try {
    const { data, error } = await db
      .from('school_payment_configurations')
      .select('*')
      .eq('school_id', schoolId)
      .eq('market_type', marketType)
      .eq('is_active', true)
      .single()

    if (error) {
      console.error('[PaymentConfig] Error fetching config:', error)
      return null
    }

    if (!data) return null

    return schoolPaymentConfigSchema.parse({
      id: data.id,
      schoolId: data.school_id,
      provider: data.provider,
      marketType: data.market_type,
      appyPayMerchantId: data.appypay_merchant_id,
      appyPayBearerToken: data.appypay_bearer_token,
      appyPayWebhookSecret: data.appypay_webhook_secret,
      enabledApplicationIds: data.enabled_application_ids || [],
      defaultApplicationId: data.default_application_id,
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    })
  } catch (err) {
    console.error('[PaymentConfig] Error parsing config:', err)
    return null
  }
}

/**
 * Obter SaaS Master Payment Config (para SIGA Plus receber planos)
 */
export async function getSaasPaymentConfig(
  db: any,
): Promise<SchoolPaymentConfig | null> {
  try {
    const { data, error } = await db
      .from('siga_saas_payment_config')
      .select('*')
      .eq('is_active', true)
      .single()

    if (error) {
      console.error('[SaasPaymentConfig] Error fetching config:', error)
      return null
    }

    if (!data) return null

    return schoolPaymentConfigSchema.parse({
      id: data.id,
      schoolId: 'siga-plus-master',
      provider: data.provider,
      marketType: 'siga_plus_plans',
      appyPayMerchantId: data.appypay_merchant_id,
      appyPayBearerToken: data.appypay_bearer_token,
      appyPayWebhookSecret: data.appypay_webhook_secret,
      enabledApplicationIds: data.enabled_application_ids || [],
      defaultApplicationId: data.default_application_id,
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    })
  } catch (err) {
    console.error('[SaasPaymentConfig] Error parsing config:', err)
    return null
  }
}

/**
 * Obter plano SaaS por ID
 */
export async function getSaasPlan(
  db: any,
  planId: string,
): Promise<SaasPaymentPlan | null> {
  try {
    const { data, error } = await db
      .from('siga_saas_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (error) return null

    return saasPaymentPlanSchema.parse({
      id: data.id,
      name: data.name,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      billingCycle: data.billing_cycle,
      paymentApplicationId: data.payment_application_id,
      paymentProvider: data.payment_provider,
      features: data.features || [],
      maxStudents: data.max_students,
      maxStaff: data.max_staff,
      maxModules: data.max_modules,
      isActive: data.is_active,
      isPublished: data.is_published,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    })
  } catch (err) {
    console.error('[SaasPlan] Error parsing plan:', err)
    return null
  }
}

/**
 * Listar planos SaaS ativos e publicados
 */
export async function listActiveSaasPlans(db: any): Promise<SaasPaymentPlan[]> {
  try {
    const { data, error } = await db
      .from('siga_saas_plans')
      .select('*')
      .eq('is_active', true)
      .eq('is_published', true)
      .order('billing_cycle', { ascending: true })

    if (error) return []

    const parsed: SaasPaymentPlan[] = []
    for (const row of data as Array<Record<string, any>>) {
      const result = saasPaymentPlanSchema.safeParse({
        id: row.id,
        name: row.name,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        billingCycle: row.billing_cycle,
        paymentApplicationId: row.payment_application_id,
        paymentProvider: row.payment_provider,
        features: row.features || [],
        maxStudents: row.max_students,
        maxStaff: row.max_staff,
        maxModules: row.max_modules,
        isActive: row.is_active,
        isPublished: row.is_published,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      })
      if (result.success) {
        parsed.push(result.data)
      }
    }
    return parsed
  } catch (err) {
    console.error('[SaasPlans] Error listing plans:', err)
    return []
  }
}
