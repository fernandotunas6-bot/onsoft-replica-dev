/**
 * Interface abstrata para Payment Providers
 * Permite trocar entre AppyPay, Stripe, PayPal, etc sem reescrever lógica
 */

export interface PaymentApplication {
  id: string
  name: string
  description?: string
  paymentMethod: string
  isDefault: boolean
  isActive: boolean
  isEnabled: boolean
  createdAt: Date
  updatedAt: Date
  applicationKeys?: {
    apiKey: string
    webHookName: string
    webHookDescription: string
    webHookUrl: string
    isActive: boolean
  }[]
}

export interface PaymentEvent {
  id: string
  type: 'payment.received' | 'payment.failed' | 'payment.pending' | 'payment.refunded'
  provider: string
  amount: number
  currency: string
  paymentMethod: string
  payerEmail?: string
  payerPhone?: string
  payerName?: string
  externalTransactionId: string
  reference?: string
  status: 'succeeded' | 'failed' | 'pending'
  failureReason?: string
  metadata?: Record<string, unknown>
  timestamp: Date
}

export interface PaymentProvider {
  /**
   * Nome do provider (appypay, stripe, paypal, etc)
   */
  getName(): string

  /**
   * Listar aplicações/configurações disponíveis
   */
  getApplications(opts?: {
    isActive?: boolean
    isEnabled?: boolean
    paymentMethod?: string
  }): Promise<PaymentApplication[]>

  /**
   * Validar assinatura de webhook
   */
  validateWebhookSignature(
    payload: unknown,
    signature: string,
    secret: string,
  ): boolean

  /**
   * Processar evento de webhook
   * Deve lançar erro se falhar
   */
  processPaymentEvent(event: PaymentEvent): Promise<void>

  /**
   * Obter aplicação específica
   */
  getApplication(applicationId: string): Promise<PaymentApplication | null>

  /**
   * Parse webhook payload para PaymentEvent
   */
  parseWebhookPayload(payload: unknown): PaymentEvent
}
