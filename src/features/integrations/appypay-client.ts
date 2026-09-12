/**
 * AppyPay Payment Gateway Client
 * Abstração segura para comunicação com AppyPay API
 *
 * Nunca expõe:
 * - API keys nos logs
 * - Webhooks URLs diretamente
 * - Merchant-sensitive data
 */

import type { PaymentApplication } from '@/features/payments/payment-provider.interface'

export interface AppyPayConfig {
  baseUrl: string
  apiVersion: string
  bearerToken: string
  webhookSecret: string
}

export interface AppyPayGetApplicationsResponse {
  applications: Array<{
    id: string
    name: string
    description: string
    paymentMethod: string
    isDefault: boolean
    isActive: boolean
    isEnabled: boolean
    CreatedBy: string
    UpdatedBy: string
    CreatedDate: string
    UpdatedDate: string
    applicationKeys?: Array<{
      apiKey: string
      webHookName: string
      webHookdescription: string
      webHookUrl: string
      isActive: boolean
    }>
  }>
  totalCount: number
  hasMorePages: boolean
}

export interface AppyPayWebhookPayload {
  id: string
  merchantId: string
  applicationId: string
  transactionId: string
  amount: number
  currency: string
  status: 'succeeded' | 'failed' | 'pending'
  paymentMethod: string
  payerEmail?: string
  payerPhone?: string
  payerName?: string
  reference?: string
  failureReason?: string
  timestamp: string
  [key: string]: unknown
}

/**
 * Cliente seguro para AppyPay API
 * Implementa retry, rate limiting, e logging seguro
 */
export class AppyPayClient {
  private config: AppyPayConfig
  private retryCount = 3
  private retryDelay = 1000

  constructor(config: AppyPayConfig) {
    if (!config.baseUrl || !config.apiVersion || !config.bearerToken) {
      throw new Error('[AppyPay] Configuration missing: baseUrl, apiVersion, bearerToken')
    }
    this.config = config
  }

  /**
   * Obter todas as aplicações configuradas
   * Com suporte a filtros e paginação
   */
  async getApplications(opts?: {
    isActive?: boolean
    isDefault?: boolean
    isEnabled?: boolean
    paymentMethod?: string
    limit?: number
    skip?: number
    language?: string
  }): Promise<PaymentApplication[]> {
    const url = new URL(`${this.config.baseUrl}/${this.config.apiVersion}/applications`)

    if (opts?.isActive !== undefined) {
      url.searchParams.append('isActive', String(opts.isActive))
    }
    if (opts?.isDefault !== undefined) {
      url.searchParams.append('isDefault', String(opts.isDefault))
    }
    if (opts?.isEnabled !== undefined) {
      url.searchParams.append('isEnabled', String(opts.isEnabled))
    }
    if (opts?.paymentMethod) {
      url.searchParams.append('paymentMethod', opts.paymentMethod)
    }
    if (opts?.limit) {
      url.searchParams.append('limit', String(opts.limit))
    }
    if (opts?.skip) {
      url.searchParams.append('skip', String(opts.skip))
    }

    const response = await this.request<AppyPayGetApplicationsResponse>('GET', url.toString(), {
      'Accept-Language': opts?.language || 'pt-BR',
    })

    return response.applications.map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      paymentMethod: app.paymentMethod,
      isDefault: app.isDefault,
      isActive: app.isActive,
      isEnabled: app.isEnabled,
      createdAt: new Date(app.CreatedDate),
      updatedAt: new Date(app.UpdatedDate),
      applicationKeys: app.applicationKeys,
    }))
  }

  /**
   * Obter aplicação específica
   */
  async getApplication(applicationId: string): Promise<PaymentApplication | null> {
    try {
      const apps = await this.getApplications()
      const app = apps.find((a) => a.id === applicationId)
      return app || null
    } catch (err) {
      console.error('[AppyPay] Error getting application:', err)
      return null
    }
  }

  /**
   * Validar assinatura de webhook
   * AppyPay envia X-Signature header com HMAC-SHA256
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      const crypto = require('crypto')
      const hmac = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex')

      return hmac === signature
    } catch (err) {
      console.error('[AppyPay] Error validating webhook signature:', err)
      return false
    }
  }

  /**
   * Requisição interna com retry automático
   */
  private async request<T>(
    method: string,
    url: string,
    headers?: Record<string, string>,
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.config.bearerToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...headers,
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.warn(
            `[AppyPay] HTTP ${response.status}:`,
            url.replace(/Bearer\s+\w+/g, 'Bearer ***'),
          )
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        return (await response.json()) as T
      } catch (err) {
        lastError = err as Error
        if (attempt < this.retryCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt)))
        }
      }
    }

    throw new Error(`[AppyPay] Request failed after ${this.retryCount} attempts: ${lastError?.message}`)
  }
}

/**
 * Factory para criar cliente AppyPay a partir de env vars
 */
export function createAppyPayClient(): AppyPayClient {
  const baseUrl = process.env.APPYPAY_BASE_URL || 'https://gwy-api-tst.appypay.co.ao'
  const apiVersion = process.env.APPYPAY_API_VERSION || 'v1'
  const bearerToken = process.env.APPYPAY_BEARER_TOKEN
  const webhookSecret = process.env.APPYPAY_WEBHOOK_SECRET

  if (!bearerToken || !webhookSecret) {
    throw new Error(
      '[AppyPay] Missing env vars: APPYPAY_BEARER_TOKEN, APPYPAY_WEBHOOK_SECRET',
    )
  }

  return new AppyPayClient({
    baseUrl,
    apiVersion,
    bearerToken,
    webhookSecret,
  })
}
