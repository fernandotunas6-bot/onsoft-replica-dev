/**
 * Payment Webhook Manager
 * Gerencia webhooks de pagamento multi-tenant
 * - Webhooks de escolas (pagamento de mensalidades)
 * - Webhooks SaaS (pagamento de planos)
 */

import { createAppyPayClient, type AppyPayWebhookPayload } from '@/features/integrations/appypay-client'
import { createAppyPayAdapter } from '@/features/payments/appypay-adapter'
import { getSchoolPaymentConfig, getSaasPaymentConfig } from '@/features/payments/payment-configuration'
import type { PaymentEvent } from '@/features/payments/payment-provider.interface'

export interface ProcessWebhookOptions {
  db: any
  payload: unknown
  signature: string
}

/**
 * Processar webhook de pagamento
 * Detecta se é escolar ou SaaS e roteia para handler correto
 */
export async function processPaymentWebhook(opts: ProcessWebhookOptions): Promise<{
  success: boolean
  marketType?: 'school_tuition' | 'siga_plus_plans'
  schoolId?: string
  eventId?: string
  error?: string
}> {
  try {
    const payload = opts.payload as AppyPayWebhookPayload

    // 1. Validar payload básico
    if (!payload.id || !payload.merchantId || !payload.transactionId) {
      return {
        success: false,
        error: 'Invalid payload: missing required fields',
      }
    }

    // 2. Tentar resolver como webhook SaaS (SIGA Plus)
    const saasConfig = await getSaasPaymentConfig(opts.db)
    if (saasConfig && saasConfig.appyPayMerchantId === payload.merchantId) {
      return await processSaasPlanPaymentWebhook({
        payload,
        signature: opts.signature,
        config: saasConfig,
        db: opts.db,
      })
    }

    // 3. Tentar resolver como webhook de escola
    // Query todas as escolas com config ativa
    const { data: configs } = await opts.db
      .from('school_payment_configurations')
      .select('school_id, appypay_merchant_id, appypay_webhook_secret, market_type')
      .eq('provider', 'appypay')
      .eq('is_active', true)

    for (const config of configs || []) {
      if (config.appypay_merchant_id === payload.merchantId) {
        return await processSchoolTuitionPaymentWebhook({
          payload,
          signature: opts.signature,
          schoolId: config.school_id,
          webhookSecret: config.appypay_webhook_secret,
          db: opts.db,
        })
      }
    }

    return {
      success: false,
      error: 'No payment configuration found for this merchant',
    }
  } catch (err) {
    console.error('[PaymentWebhookManager] Error processing webhook:', err)
    return {
      success: false,
      error: String(err),
    }
  }
}

/**
 * Processar webhook de pagamento de mensalidade (escola)
 */
async function processSchoolTuitionPaymentWebhook(opts: {
  payload: AppyPayWebhookPayload
  signature: string
  schoolId: string
  webhookSecret: string
  db: any
}): Promise<{
  success: boolean
  marketType: 'school_tuition'
  schoolId: string
  eventId: string
  error?: string
}> {
  try {
    console.log('[SchoolTuition Webhook] Processing payment for school:', opts.schoolId)

    // 1. Criar client AppyPay com credenciais da escola
    const config = await getSchoolPaymentConfig(opts.db, opts.schoolId, 'school_tuition')
    if (!config) {
      return {
        success: false,
        marketType: 'school_tuition',
        schoolId: opts.schoolId,
        eventId: opts.payload.id,
        error: 'School payment configuration not found',
      }
    }

    // 2. Validar assinatura
    const client = new (await import('@/features/integrations/appypay-client')).AppyPayClient({
      baseUrl: process.env.APPYPAY_BASE_URL || 'https://gwy-api-tst.appypay.co.ao',
      apiVersion: process.env.APPYPAY_API_VERSION || 'v1',
      bearerToken: config.appyPayBearerToken,
      webhookSecret: config.appyPayWebhookSecret,
    })

    const payloadStr = JSON.stringify(opts.payload)
    const isValid = client.validateWebhookSignature(payloadStr, opts.signature)

    if (!isValid) {
      console.warn('[SchoolTuition Webhook] Invalid signature for school:', opts.schoolId)
      return {
        success: false,
        marketType: 'school_tuition',
        schoolId: opts.schoolId,
        eventId: opts.payload.id,
        error: 'Invalid webhook signature',
      }
    }

    // 3. Parse payload e processar
    const adapter = new (await import('@/features/payments/appypay-adapter')).AppyPayAdapter(client)
    const event = adapter.parseWebhookPayload(opts.payload)

    // 4. Log e armazenar evento
    await logPaymentEvent(opts.db, {
      schoolId: opts.schoolId,
      marketType: 'school_tuition',
      event,
    })

    // 5. Processar evento (aqui integrar com Communication Service)
    await adapter.processPaymentEvent(event)

    console.log('[SchoolTuition Webhook] Payment processed successfully:', {
      schoolId: opts.schoolId,
      eventId: event.id,
      amount: event.amount,
    })

    return {
      success: true,
      marketType: 'school_tuition',
      schoolId: opts.schoolId,
      eventId: event.id,
    }
  } catch (err) {
    console.error('[SchoolTuition Webhook] Error:', err)
    return {
      success: false,
      marketType: 'school_tuition',
      schoolId: opts.schoolId,
      eventId: opts.payload.id,
      error: String(err),
    }
  }
}

/**
 * Processar webhook de pagamento de plano SaaS (SIGA Plus)
 */
async function processSaasPlanPaymentWebhook(opts: {
  payload: AppyPayWebhookPayload
  signature: string
  config: any
  db: any
}): Promise<{
  success: boolean
  marketType: 'siga_plus_plans'
  eventId: string
  error?: string
}> {
  try {
    console.log('[SaasPlan Webhook] Processing payment for plan')

    // 1. Validar assinatura
    const client = new (await import('@/features/integrations/appypay-client')).AppyPayClient({
      baseUrl: process.env.APPYPAY_BASE_URL || 'https://gwy-api-tst.appypay.co.ao',
      apiVersion: process.env.APPYPAY_API_VERSION || 'v1',
      bearerToken: opts.config.appyPayBearerToken,
      webhookSecret: opts.config.appyPayWebhookSecret,
    })

    const payloadStr = JSON.stringify(opts.payload)
    const isValid = client.validateWebhookSignature(payloadStr, opts.signature)

    if (!isValid) {
      console.warn('[SaasPlan Webhook] Invalid signature')
      return {
        success: false,
        marketType: 'siga_plus_plans',
        eventId: opts.payload.id,
        error: 'Invalid webhook signature',
      }
    }

    // 2. Parse payload
    const adapter = new (await import('@/features/payments/appypay-adapter')).AppyPayAdapter(client)
    const event = adapter.parseWebhookPayload(opts.payload)

    // 3. Buscar subscription relacionada (por referência)
    if (opts.payload.reference) {
      const { data: subscription } = await opts.db
        .from('school_plan_subscriptions')
        .select('*')
        .eq('id', opts.payload.reference)
        .single()

      if (subscription) {
        // 4. Atualizar status da subscrição
        if (event.status === 'succeeded') {
          await opts.db
            .from('school_plan_subscriptions')
            .update({
              status: 'active',
              last_payment_date: new Date(),
              last_transaction_id: event.externalTransactionId,
            })
            .eq('id', subscription.id)

          console.log('[SaasPlan Webhook] Subscription activated:', subscription.id)
        } else if (event.status === 'failed') {
          await opts.db
            .from('school_plan_subscriptions')
            .update({
              status: 'suspended',
              failure_reason: event.failureReason,
            })
            .eq('id', subscription.id)

          console.log('[SaasPlan Webhook] Subscription suspended:', subscription.id)
        }
      }
    }

    // 5. Log evento
    await logPaymentEvent(opts.db, {
      schoolId: 'siga-plus-master',
      marketType: 'siga_plus_plans',
      event,
    })

    console.log('[SaasPlan Webhook] Payment processed successfully:', {
      eventId: event.id,
      amount: event.amount,
    })

    return {
      success: true,
      marketType: 'siga_plus_plans',
      eventId: event.id,
    }
  } catch (err) {
    console.error('[SaasPlan Webhook] Error:', err)
    return {
      success: false,
      marketType: 'siga_plus_plans',
      eventId: opts.payload.id,
      error: String(err),
    }
  }
}

/**
 * Registrar evento de pagamento no log
 */
async function logPaymentEvent(
  db: any,
  opts: {
    schoolId: string
    marketType: 'school_tuition' | 'siga_plus_plans'
    event: PaymentEvent
  },
) {
  try {
    await db.from('payment_events').insert({
      id: opts.event.id,
      school_id: opts.schoolId,
      market_type: opts.marketType,
      type: opts.event.type,
      provider: opts.event.provider,
      status: opts.event.status,
      amount: opts.event.amount,
      currency: opts.event.currency,
      payment_method: opts.event.paymentMethod,
      external_transaction_id: opts.event.externalTransactionId,
      payer_email: opts.event.payerEmail,
      payer_phone: opts.event.payerPhone,
      payer_name: opts.event.payerName,
      reference: opts.event.reference,
      failure_reason: opts.event.failureReason,
      metadata: opts.event.metadata,
      created_at: new Date(),
    })
  } catch (err) {
    console.error('[PaymentEventLog] Error logging event:', err)
  }
}
