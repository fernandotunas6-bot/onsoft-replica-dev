import { json } from '@tanstack/react-start'
import { loadSgaAdminClient } from '@/integrations/supabase/sga-admin'
import { processPaymentWebhook } from '@/features/payments/payment-webhook-manager'

/**
 * POST /api/webhooks/appypay-payment
 *
 * Recebe webhooks de pagamento do AppyPay.
 * Multi-tenant: roteia para escola certa ou SaaS de planos.
 *
 * Suporta dois tipos de eventos:
 * 1. Pagamento de Mensalidade (Escola)
 *    - merchantId pertence a uma escola
 *    - Notifica aluno/responsável sobre pagamento
 *
 * 2. Pagamento de Plano SaaS (SIGA Plus)
 *    - merchantId é master de SIGA Plus
 *    - Ativa/Desativa subscrição de escola
 *
 * Headers esperados:
 * - X-AppyPay-Signature: HMAC-SHA256 da request
 *
 * Body esperado (JSON):
 * - id: UUID único do evento
 * - merchantId: Identificador do merchant (escola ou master)
 * - applicationId: Aplicação de pagamento (GPO, UMM, etc)
 * - transactionId: ID da transação
 * - amount: Valor do pagamento
 * - currency: Moeda (AOA, USD, etc)
 * - status: succeeded | failed | pending
 * - paymentMethod: Método de pagamento (GPO, UMM, REF, eTPA)
 * - payerEmail: Email do pagador (opcional)
 * - payerPhone: Telefone do pagador (opcional)
 * - payerName: Nome do pagador (opcional)
 * - reference: Referência interna (opcional)
 * - failureReason: Motivo da falha (opcional)
 * - timestamp: ISO 8601 datetime
 */

export async function POST(request: Request) {
  try {
    // 1. Verificar método
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 })
    }

    // 2. Ler body
    const body = await request.json()

    // 3. Obter assinatura
    const signature = request.headers.get('x-appypay-signature') || ''

    // 4. Carregar database
    let db
    try {
      db = await loadSgaAdminClient()
    } catch (err) {
      console.error('[AppyPay Webhook] Database connection failed:', err)
      return json({ error: 'Database connection failed' }, { status: 500 })
    }

    // 5. Processar webhook (detecta escola ou SaaS)
    const result = await processPaymentWebhook({
      db,
      payload: body,
      signature,
    })

    if (!result.success) {
      console.warn('[AppyPay Webhook] Processing failed:', result.error)

      // Retornar diferentes status codes baseado no tipo de erro
      if (result.error?.includes('Invalid signature')) {
        return json({ error: result.error }, { status: 401 })
      } else if (result.error?.includes('Invalid payload')) {
        return json({ error: result.error }, { status: 400 })
      } else {
        // 202 = recebemos mas houve erro; AppyPay pode retentara
        return json(
          {
            success: false,
            message: result.error,
            eventId: body.id,
          },
          { status: 202 },
        )
      }
    }

    // 6. Responder com sucesso
    console.log('[AppyPay Webhook] Payment processed successfully:', {
      marketType: result.marketType,
      schoolId: result.schoolId,
      eventId: result.eventId,
    })

    return json(
      {
        success: true,
        marketType: result.marketType,
        schoolId: result.schoolId,
        eventId: result.eventId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch (err) {
    console.error('[AppyPay Webhook] Unexpected error:', err)
    return json({ error: 'Internal server error' }, { status: 500 })
  }
}
