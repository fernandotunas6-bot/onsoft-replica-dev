/**
 * Testes para AppyPayAdapter
 * Valida parsing de webhooks e processamento de eventos
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AppyPayAdapter } from './appypay-adapter'
import type { AppyPayClient } from '@/features/integrations/appypay-client'

// Mock do AppyPayClient
const mockAppyPayClient = {
  getApplications: vi.fn(),
  getApplication: vi.fn(),
  validateWebhookSignature: vi.fn(),
} as unknown as AppyPayClient

describe('AppyPayAdapter', () => {
  let adapter: AppyPayAdapter

  beforeEach(() => {
    adapter = new AppyPayAdapter(mockAppyPayClient)
    vi.clearAllMocks()
  })

  describe('parseWebhookPayload', () => {
    it('deve parsear webhook de pagamento recebido', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'merchant-123',
        applicationId: 'app-gpo-123',
        transactionId: 'txn-12345',
        amount: 500.0,
        currency: 'AOA',
        status: 'succeeded',
        paymentMethod: 'GPO',
        payerEmail: 'user@example.com',
        payerPhone: '+244912345678',
        payerName: 'João Silva',
        reference: 'REF-2024-001',
        timestamp: '2026-09-12T10:30:00Z',
      }

      const event = adapter.parseWebhookPayload(payload)

      expect(event).toMatchObject({
        id: payload.id,
        type: 'payment.received',
        provider: 'appypay',
        amount: 500.0,
        currency: 'AOA',
        paymentMethod: 'GPO',
        status: 'succeeded',
      })
    })

    it('deve mapear status succeeded para payment.received', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'merchant-123',
        applicationId: 'app-gpo-123',
        transactionId: 'txn-12345',
        amount: 500.0,
        currency: 'AOA',
        status: 'succeeded' as const,
        paymentMethod: 'GPO',
        timestamp: '2026-09-12T10:30:00Z',
      }

      const event = adapter.parseWebhookPayload(payload)
      expect(event.type).toBe('payment.received')
    })

    it('deve mapear status failed para payment.failed', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'merchant-123',
        applicationId: 'app-gpo-123',
        transactionId: 'txn-12345',
        amount: 500.0,
        currency: 'AOA',
        status: 'failed' as const,
        paymentMethod: 'GPO',
        failureReason: 'Insufficient funds',
        timestamp: '2026-09-12T10:30:00Z',
      }

      const event = adapter.parseWebhookPayload(payload)
      expect(event.type).toBe('payment.failed')
      expect(event.failureReason).toBe('Insufficient funds')
    })

    it('deve mapear status pending para payment.pending', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'merchant-123',
        applicationId: 'app-gpo-123',
        transactionId: 'txn-12345',
        amount: 500.0,
        currency: 'AOA',
        status: 'pending' as const,
        paymentMethod: 'UMM',
        timestamp: '2026-09-12T10:30:00Z',
      }

      const event = adapter.parseWebhookPayload(payload)
      expect(event.type).toBe('payment.pending')
    })

    it('deve lançar erro se payload inválido', () => {
      const invalidPayload = {
        id: 'not-a-uuid',
        amount: -100, // Negativo
        // Missing required fields
      }

      expect(() => adapter.parseWebhookPayload(invalidPayload)).toThrow()
    })

    it('deve incluir metadados da transação', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'merchant-123',
        applicationId: 'app-gpo-123',
        transactionId: 'txn-12345',
        amount: 500.0,
        currency: 'AOA',
        status: 'succeeded' as const,
        paymentMethod: 'GPO',
        timestamp: '2026-09-12T10:30:00Z',
      }

      const event = adapter.parseWebhookPayload(payload)

      expect(event.metadata).toEqual({
        merchantId: 'merchant-123',
        applicationId: 'app-gpo-123',
      })
    })
  })

  describe('validateWebhookSignature', () => {
    it('deve validar assinatura correta', () => {
      vi.mocked(mockAppyPayClient.validateWebhookSignature).mockReturnValue(true)

      const payload = { test: 'data' }
      const signature = 'valid-signature'

      const result = adapter.validateWebhookSignature(payload, signature)

      expect(result).toBe(true)
    })

    it('deve rejeitar assinatura inválida', () => {
      vi.mocked(mockAppyPayClient.validateWebhookSignature).mockReturnValue(false)

      const payload = { test: 'data' }
      const signature = 'invalid-signature'

      const result = adapter.validateWebhookSignature(payload, signature)

      expect(result).toBe(false)
    })
  })

  describe('getName', () => {
    it('deve retornar appypay', () => {
      expect(adapter.getName()).toBe('appypay')
    })
  })

  describe('processPaymentEvent', () => {
    it('deve processar evento sem erros', async () => {
      const event = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'payment.received' as const,
        provider: 'appypay',
        amount: 500.0,
        currency: 'AOA',
        paymentMethod: 'GPO',
        externalTransactionId: 'txn-12345',
        status: 'succeeded' as const,
        timestamp: new Date(),
      }

      // Não deve lançar erro
      await expect(adapter.processPaymentEvent(event)).resolves.toBeUndefined()
    })
  })
})
