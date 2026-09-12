import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import {
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from '@/integrations/supabase/sga-admin'
import { AppyPayClient } from '@/features/integrations/appypay-client'

/**
 * Schema para validar credenciais AppyPay da escola
 */
export const schoolPaymentConfigSchema = z.object({
  appyPayMerchantId: z.string().min(3).max(100),
  appyPayBearerToken: z.string().min(10),
  appyPayWebhookSecret: z.string().min(10),
  enabledApplicationIds: z.array(z.string().uuid()).min(1),
  defaultApplicationId: z.string().uuid().optional(),
})

export type SchoolPaymentConfigInput = z.infer<typeof schoolPaymentConfigSchema>

/**
 * Obter configuração de pagamento da escola
 */
export const getSchoolPaymentConfiguration = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const membership = await resolveSgaMembershipAdmin(context.userId)
      if (!membership) {
        throw new Error('Sem vínculo ativo com esta escola.')
      }

      const db = await loadSgaAdminClient()
      const { data, error } = await db
        .from('school_payment_configurations')
        .select(
          'id, appypay_merchant_id, enabled_application_ids, default_application_id, is_active, created_at, updated_at',
        )
        .eq('school_id', membership.schoolId)
        .eq('market_type', 'school_tuition')
        .eq('is_active', true)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (!data) {
        return {
          exists: false,
          message: 'Nenhuma configuração de pagamento encontrada.',
        }
      }

      return {
        exists: true,
        id: data.id,
        merchantId: data.appypay_merchant_id,
        enabledApplicationIds: data.enabled_application_ids || [],
        defaultApplicationId: data.default_application_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }
    } catch (err) {
      console.error('[PaymentConfig] Error fetching config:', err)
      throw new Error(`Erro ao buscar configuração: ${String(err)}`)
    }
  })

/**
 * Testar credenciais AppyPay (sem salvar ainda)
 * Valida se as credenciais são válidas
 */
export const testAppyPayCredentials = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        merchantId: z.string(),
        bearerToken: z.string(),
        webhookSecret: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const client = new AppyPayClient({
        baseUrl: process.env.APPYPAY_BASE_URL || 'https://gwy-api-tst.appypay.co.ao',
        apiVersion: process.env.APPYPAY_API_VERSION || 'v1',
        bearerToken: data.bearerToken,
        webhookSecret: data.webhookSecret,
      })

      // Tentar buscar aplicações para validar credenciais
      const applications = await client.getApplications()

      if (!applications || applications.length === 0) {
        return {
          success: false,
          error: 'Nenhuma aplicação encontrada. Verifique as credenciais.',
          applications: [],
        }
      }

      return {
        success: true,
        message: `Conectado com sucesso! Encontradas ${applications.length} aplicações.`,
        applications: applications.map((app) => ({
          id: app.id,
          name: app.name,
          paymentMethod: app.paymentMethod,
          isDefault: app.isDefault,
          isActive: app.isActive,
          isEnabled: app.isEnabled,
        })),
      }
    } catch (err) {
      console.error('[TestAppyPay] Error:', err)
      return {
        success: false,
        error: `Erro ao conectar: ${String(err)}`,
        applications: [],
      }
    }
  })

/**
 * Salvar configuração de pagamento da escola
 */
export const saveSchoolPaymentConfiguration = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolPaymentConfigSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const membership = await resolveSgaMembershipAdmin(context.userId)
      if (!membership) {
        throw new Error('Sem vínculo ativo com esta escola.')
      }

      const db = await loadSgaAdminClient()

      // Verificar se já existe configuração
      const { data: existing } = await db
        .from('school_payment_configurations')
        .select('id')
        .eq('school_id', membership.schoolId)
        .eq('market_type', 'school_tuition')
        .single()

      // Se existe, atualizar; senão, criar
      if (existing) {
        const { error } = await db
          .from('school_payment_configurations')
          .update({
            appypay_merchant_id: data.appyPayMerchantId,
            appypay_bearer_token: data.appyPayBearerToken, // Será criptografado pelo BD
            appypay_webhook_secret: data.appyPayWebhookSecret, // Será criptografado pelo BD
            enabled_application_ids: data.enabledApplicationIds,
            default_application_id: data.defaultApplicationId,
            is_active: true,
            updated_at: new Date(),
          })
          .eq('id', existing.id)

        if (error) throw error

        return {
          success: true,
          message: 'Configuração atualizada com sucesso!',
          configId: existing.id,
        }
      } else {
        const { data: newConfig, error } = await db
          .from('school_payment_configurations')
          .insert({
            school_id: membership.schoolId,
            provider: 'appypay',
            market_type: 'school_tuition',
            appypay_merchant_id: data.appyPayMerchantId,
            appypay_bearer_token: data.appyPayBearerToken,
            appypay_webhook_secret: data.appyPayWebhookSecret,
            enabled_application_ids: data.enabledApplicationIds,
            default_application_id: data.defaultApplicationId,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .select('id')
          .single()

        if (error) throw error

        return {
          success: true,
          message: 'Configuração criada com sucesso!',
          configId: newConfig.id,
        }
      }
    } catch (err) {
      console.error('[SavePaymentConfig] Error:', err)
      throw new Error(`Erro ao salvar configuração: ${String(err)}`)
    }
  })

/**
 * Desativar configuração de pagamento
 */
export const disableSchoolPaymentConfiguration = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const membership = await resolveSgaMembershipAdmin(context.userId)
      if (!membership) {
        throw new Error('Sem vínculo ativo com esta escola.')
      }

      const db = await loadSgaAdminClient()
      const { error } = await db
        .from('school_payment_configurations')
        .update({
          is_active: false,
          updated_at: new Date(),
        })
        .eq('school_id', membership.schoolId)
        .eq('market_type', 'school_tuition')

      if (error) throw error

      return {
        success: true,
        message: 'Configuração desativada. Pagamentos desabilitados.',
      }
    } catch (err) {
      console.error('[DisablePaymentConfig] Error:', err)
      throw new Error(`Erro ao desativar: ${String(err)}`)
    }
  })

/**
 * Gerar URL de webhook único para a escola
 */
export const getWebhookUrl = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const membership = await resolveSgaMembershipAdmin(context.userId)
      if (!membership) {
        throw new Error('Sem vínculo ativo com esta escola.')
      }

      const baseUrl = process.env.PUBLIC_APP_URL || 'https://app.siga.ao'
      const webhookUrl = `${baseUrl}/api/webhooks/appypay-payment`

      return {
        webhookUrl,
        instructions: [
          '1. Copie esta URL',
          '2. Vá ao painel AppyPay',
          '3. Webhooks → Criar Novo',
          '4. Cole a URL acima',
          '5. Selecione eventos: payment.succeeded, payment.failed',
          '6. Use o Webhook Secret que você forneceu',
          '7. Clique Criar',
        ],
      }
    } catch (err) {
      console.error('[GetWebhookUrl] Error:', err)
      throw err
    }
  })
