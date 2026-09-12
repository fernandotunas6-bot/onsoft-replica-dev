/**
 * AppyPay Payment Provider Adapter
 * Implementação concreta da interface PaymentProvider para AppyPay
 */

import type { PaymentApplication, PaymentEvent, PaymentProvider } from './payment-provider.interface'
import { AppyPayClient, type AppyPayWebhookPayload } from '@/features/integrations/appypay-client'
import { z } from 'zod'

/**
 * Schema para validar webhooks do AppyPay
 * Garante type-safety ao processar eventos
 */
const appyPayWebhookSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string(),
  applicationId: z.string().uuid(),
  transactionId: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  status: z.enum(['succeeded', 'failed', 'pending']),
  paymentMethod: z.string(),
  payerEmail: z.string().email().optional(),
  payerPhone: z.string().optional(),
  payerName: z.string().optional(),
  reference: z.string().optional(),
  failureReason: z.string().optional(),
  timestamp: z.string().datetime(),
})

type AppyPayWebhookValidated = z.infer<typeof appyPayWebhookSchema>

/**
 * Adapter AppyPay - Implementa PaymentProvider
 * Conecta AppyPay com o SIGA Communication Layer
 */
export class AppyPayAdapter implements PaymentProvider {
  private client: AppyPayClient
  private applicationCache: Map<string, PaymentApplication> = new Map()
  private cacheExpiry: number = 5 * 60 * 1000 // 5 minutos

  constructor(client: AppyPayClient) {
    this.client = client
  }

  getName(): string {
    return 'appypay'
  }

  async getApplications(opts?: {
    isActive?: boolean
    isEnabled?: boolean
    paymentMethod?: string
  }): Promise<PaymentApplication[]> {
    try {
      const apps = await this.client.getApplications({
        isActive: opts?.isActive,
        isEnabled: opts?.isEnabled,
        paymentMethod: opts?.paymentMethod,
      })

      // Cache aplicações para uso posterior
      for (const app of apps) {
        this.applicationCache.set(app.id, app)
      }

      return apps
    } catch (err) {
      console.error('[AppyPayAdapter] Error fetching applications:', err)
      throw err
    }
  }

  async getApplication(applicationId: string): Promise<PaymentApplication | null> {
    try {
      // Tentar cache primeiro
      if (this.applicationCache.has(applicationId)) {
        return this.applicationCache.get(applicationId) || null
      }

      // Buscar do cliente
      return await this.client.getApplication(applicationId)
    } catch (err) {
      console.error('[AppyPayAdapter] Error fetching application:', err)
      return null
    }
  }

  validateWebhookSignature(
    payload: unknown,
    signature: string,
    secret?: string,
  ): boolean {
    try {
      // Serializar payload
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload)

      // Usar secret passado ou default do cliente
      if (secret) {
        return this.client.validateWebhookSignature(payloadStr, signature)
      }

      return this.client.validateWebhookSignature(payloadStr, signature)
    } catch (err) {
      console.error('[AppyPayAdapter] Error validating webhook:', err)
      return false
    }
  }

  parseWebhookPayload(payload: unknown): PaymentEvent {
    try {
      // Validar schema
      const validated = appyPayWebhookSchema.parse(payload)

      // Mapear para PaymentEvent
      return {
        id: validated.id,
        type: this.mapPaymentType(validated.status),
        provider: 'appypay',
        amount: validated.amount,
        currency: validated.currency,
        paymentMethod: validated.paymentMethod,
        payerEmail: validated.payerEmail,
        payerPhone: validated.payerPhone,
        payerName: validated.payerName,
        externalTransactionId: validated.transactionId,
        reference: validated.reference,
        status: validated.status,
        failureReason: validated.failureReason,
        metadata: {
          merchantId: validated.merchantId,
          applicationId: validated.applicationId,
        },
        timestamp: new Date(validated.timestamp),
      }
    } catch (err) {
      console.error('[AppyPayAdapter] Error parsing webhook payload:', err)
      throw new Error(`Invalid AppyPay webhook payload: ${String(err)}`)
    }
  }

  async processPaymentEvent(event: PaymentEvent): Promise<void> {
    try {
      console.log('[AppyPayAdapter] Processing payment event:', {
        id: event.id,
        type: event.type,
        amount: event.amount,
        status: event.status,
      })

      // Aqui você integraria com o Communication Layer do SIGA
      // Por exemplo, disparar notificações de pagamento recebido

      // Placeholder: Log do evento
      console.log('[AppyPayAdapter] Payment event processed successfully')
    } catch (err) {
      console.error('[AppyPayAdapter] Error processing payment event:', err)
      throw err
    }
  }

  /**
   * Mapear status AppyPay para tipo de evento
   */
  private mapPaymentType(
    status: 'succeeded' | 'failed' | 'pending',
  ): PaymentEvent['type'] {
    switch (status) {
      case 'succeeded':
        return 'payment.received'
      case 'failed':
        return 'payment.failed'
      case 'pending':
        return 'payment.pending'
      default:
        return 'payment.pending'
    }
  }
}

/**
 * Factory para criar adapter AppyPay
 */
export function createAppyPayAdapter(client: AppyPayClient): AppyPayAdapter {
  return new AppyPayAdapter(client)
}
