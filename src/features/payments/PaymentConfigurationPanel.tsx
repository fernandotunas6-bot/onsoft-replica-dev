import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSchoolPaymentConfiguration,
  testAppyPayCredentials,
  saveSchoolPaymentConfiguration,
  disableSchoolPaymentConfiguration,
  getWebhookUrl,
  type SchoolPaymentConfigInput,
} from './payment-configuration-server'

type TestCredentialsResult = {
  success: boolean
  message?: string
  error?: string
  applications: Array<{
    id: string
    name: string
    paymentMethod: string
    isDefault: boolean
    isActive: boolean
    isEnabled: boolean
  }>
}

export function PaymentConfigurationPanel() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [testResult, setTestResult] = useState<TestCredentialsResult | null>(null)

  // Buscar configuração existente
  const { data: config, isLoading } = useQuery({
    queryKey: ['school-payment-config'],
    queryFn: () => getSchoolPaymentConfiguration(),
  })

  // Buscar URL do webhook
  const { data: webhookData } = useQuery({
    queryKey: ['webhook-url'],
    queryFn: () => getWebhookUrl(),
  })

  // Testar credenciais
  const testCredentialsMutation = useMutation({
    mutationFn: (vars: { merchantId: string; bearerToken: string; webhookSecret: string }) =>
      testAppyPayCredentials({ data: vars }),
    onSuccess: (data) => {
      setTestResult(data)
    },
  })

  // Salvar configuração
  const saveConfigMutation = useMutation({
    mutationFn: (vars: SchoolPaymentConfigInput) => saveSchoolPaymentConfiguration({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-payment-config'] })
      setShowForm(false)
      alert('Configuração salva com sucesso!')
    },
    onError: (err) => {
      alert(`Erro ao salvar: ${String(err)}`)
    },
  })

  // Desativar configuração
  const disableConfigMutation = useMutation({
    mutationFn: () => disableSchoolPaymentConfiguration(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-payment-config'] })
      alert('Configuração desativada')
    },
  })

  if (isLoading) {
    return <div className="p-4">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Configuração de Pagamentos</h1>
        <p className="text-gray-600">
          Configure como sua escola recebe pagamentos de alunos via AppyPay
        </p>
      </div>

      {/* Status Atual */}
      {config?.exists ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-green-900 mb-2">
                ✓ Pagamentos Configurados
              </h2>
              <div className="space-y-2 text-sm text-green-700">
                <p>
                  <strong>Merchant ID:</strong> {config.merchantId}
                </p>
                <p>
                  <strong>Aplicações Habilitadas:</strong> {config.enabledApplicationIds?.length ?? 0}
                </p>
                <p>
                  <strong>Configurado em:</strong>{' '}
                  {config.createdAt ? new Date(config.createdAt).toLocaleDateString('pt-BR') : '—'}
                </p>
                <p>
                  <strong>Última atualização:</strong>{' '}
                  {config.updatedAt ? new Date(config.updatedAt).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setShowForm(true)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Atualizar Configuração
              </button>
              <button
                onClick={() => {
                  if (confirm('Deseja desativar os pagamentos?')) {
                    disableConfigMutation.mutate()
                  }
                }}
                className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
              >
                Desativar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-yellow-900 mb-2">
            ⚠ Pagamentos Não Configurados
          </h2>
          <p className="text-yellow-700 mb-4">
            Sua escola ainda não está configurada para receber pagamentos. Configure agora para começar a
            receber mensalidades de alunos.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Configurar Agora
          </button>
        </div>
      )}

      {/* Formulário de Configuração */}
      {showForm && (
        <ConfigurationForm
          onTest={(vars) => testCredentialsMutation.mutate(vars)}
          onSubmit={(data) => saveConfigMutation.mutate(data)}
          onCancel={() => {
            setShowForm(false)
            setTestResult(null)
          }}
          isTesting={testCredentialsMutation.isPending}
          isSaving={saveConfigMutation.isPending}
          testResult={testResult}
        />
      )}

      {/* Informações de Webhook */}
      {config?.exists && webhookData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Configuração de Webhook</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">
                URL do Webhook (registre no AppyPay):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookData.webhookUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border border-blue-300 rounded-lg text-sm font-mono text-gray-700"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(webhookData.webhookUrl)
                    alert('URL copiada!')
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Copiar
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Instruções de Registro:
              </label>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                {webhookData.instructions.map((instruction, i) => (
                  <li key={i}>{instruction}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Guia de Configuração */}
      <ConfigurationGuide />
    </div>
  )
}

/**
 * Formulário de Configuração
 */
function ConfigurationForm({
  onTest,
  onSubmit,
  onCancel,
  isTesting,
  isSaving,
  testResult,
}: {
  onTest: (vars: { merchantId: string; bearerToken: string; webhookSecret: string }) => void
  onSubmit: (data: SchoolPaymentConfigInput) => void
  onCancel: () => void
  isTesting: boolean
  isSaving: boolean
  testResult: TestCredentialsResult | null
}) {
  const [formData, setFormData] = useState({
    appyPayMerchantId: '',
    appyPayBearerToken: '',
    appyPayWebhookSecret: '',
  })
  const isLoading = isTesting || isSaving

  const handleTest = () => {
    if (!formData.appyPayMerchantId || !formData.appyPayBearerToken || !formData.appyPayWebhookSecret) {
      alert('Preencha todos os campos obrigatórios antes de testar')
      return
    }
    onTest({
      merchantId: formData.appyPayMerchantId,
      bearerToken: formData.appyPayBearerToken,
      webhookSecret: formData.appyPayWebhookSecret,
    })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    if (!testResult || !testResult.success || testResult.applications.length === 0) {
      alert('Execute o teste de conexão primeiro')
      return
    }

    const appIds = testResult.applications.map((app) => app.id)
    onSubmit({
      appyPayMerchantId: formData.appyPayMerchantId,
      appyPayBearerToken: formData.appyPayBearerToken,
      appyPayWebhookSecret: formData.appyPayWebhookSecret,
      enabledApplicationIds: appIds,
      defaultApplicationId: appIds[0],
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Conectar AppyPay</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Merchant ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Merchant ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.appyPayMerchantId}
            onChange={(e) => setFormData({ ...formData, appyPayMerchantId: e.target.value })}
            placeholder="ex: escola-123"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Seu Merchant ID do AppyPay (encontre no painel AppyPay → Configurações)
          </p>
        </div>

        {/* Bearer Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bearer Token <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={formData.appyPayBearerToken}
            onChange={(e) => setFormData({ ...formData, appyPayBearerToken: e.target.value })}
            placeholder="seu-bearer-token"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Token de autenticação da API do AppyPay (mantido seguro e criptografado)
          </p>
        </div>

        {/* Webhook Secret */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Webhook Secret <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={formData.appyPayWebhookSecret}
            onChange={(e) => setFormData({ ...formData, appyPayWebhookSecret: e.target.value })}
            placeholder="seu-webhook-secret"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Secret usado para validar webhooks do AppyPay (mantido seguro e criptografado)
          </p>
        </div>

        {/* Botão de Teste */}
        <button
          type="button"
          onClick={handleTest}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm"
        >
          {isTesting ? 'Testando...' : 'Testar Conexão'}
        </button>

        {/* Resultado do Teste */}
        {testResult && (
          <div
            className={`p-3 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}
          >
            <p
              className={`text-sm font-medium ${testResult.success ? 'text-green-900' : 'text-red-900'}`}
            >
              {testResult.success ? testResult.message : testResult.error}
            </p>
            {testResult.success && testResult.applications.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-green-900">Aplicações encontradas:</p>
                {testResult.applications.map((app) => (
                  <div key={app.id} className="text-xs text-green-800">
                    • <strong>{app.name}</strong> ({app.paymentMethod})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            disabled={isLoading || !testResult?.success}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
          >
            {isSaving ? 'Salvando...' : 'Salvar Configuração'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-medium text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Guia de Configuração
 */
function ConfigurationGuide() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const sections = [
    {
      id: 'create-account',
      title: '1️⃣ Criar Conta no AppyPay',
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>Se você já tem conta AppyPay:</strong> Pule para a seção "Obter Credenciais"
          </p>
          <p>
            <strong>Se você não tem:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Acesse o site AppyPay: https://appypay.co.ao</li>
            <li>Clique em "Criar Conta" ou "Registrar"</li>
            <li>
              Preencha dados da sua escola:
              <ul className="list-disc list-inside ml-4 mt-1">
                <li>Nome da escola</li>
                <li>Email administrativo</li>
                <li>Telefone de contato</li>
                <li>Endereço</li>
              </ul>
            </li>
            <li>Aguarde verificação (pode levar 24-48h)</li>
            <li>Ative sua conta via link de confirmação</li>
          </ol>
        </div>
      ),
    },
    {
      id: 'get-credentials',
      title: '2️⃣ Obter Credenciais AppyPay',
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>Passo-a-passo:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Faça login no painel AppyPay: https://dashboard.appypay.co.ao</li>
            <li>Vá para: Configurações → Credenciais da API</li>
            <li>
              Copie: <strong>Merchant ID</strong>
            </li>
            <li>
              Gere um novo: <strong>Bearer Token</strong> (ou use o existente)
            </li>
            <li>
              Gere um novo: <strong>Webhook Secret</strong>
            </li>
            <li>Cole cada um no formulário acima</li>
          </ol>
          <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
            <p className="text-xs font-mono text-blue-900">
              💡 Dica: Guarde o Webhook Secret em local seguro. Você precisará dele depois.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'select-apps',
      title: '3️⃣ Selecionar Métodos de Pagamento',
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>O que são "Aplicações"?</strong> São os métodos de pagamento disponíveis:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>GPO</strong> - Giro Postal (transferência bancária)
            </li>
            <li>
              <strong>UMM</strong> - E-wallet local
            </li>
            <li>
              <strong>REF</strong> - Referência de pagamento
            </li>
            <li>
              <strong>eTPA</strong> - Transferência eletrônica
            </li>
          </ul>
          <p className="mt-3">
            <strong>Como escolher:</strong> Selecione os métodos que você quer oferecer aos alunos. Por
            exemplo, se quer aceitar GPO e UMM, selecione ambos.
          </p>
          <p>
            O sistema automaticamente detectará as aplicações da sua conta AppyPay quando você colar as
            credenciais.
          </p>
        </div>
      ),
    },
    {
      id: 'webhook',
      title: '4️⃣ Registrar Webhook',
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>O que é Webhook?</strong> É como AppyPay nos avisa quando um pagamento foi recebido.
          </p>
          <p>
            <strong>Como registrar:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Copie a URL do Webhook acima (botão Copiar)</li>
            <li>Vá ao painel AppyPay: Webhooks → Criar Novo</li>
            <li>Cole a URL</li>
            <li>
              Selecione eventos:
              <ul className="list-disc list-inside ml-4 mt-1">
                <li>payment.succeeded</li>
                <li>payment.failed</li>
              </ul>
            </li>
            <li>Cole o Webhook Secret que você forneceu</li>
            <li>Clique "Criar"</li>
          </ol>
        </div>
      ),
    },
    {
      id: 'test',
      title: '5️⃣ Testar Configuração',
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>Como testar:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Preencheu todos os campos? Clique em "Testar Conexão"</li>
            <li>O sistema valida as credenciais com o AppyPay</li>
            <li>Se aparecer ✓ (verde), está funcionando!</li>
            <li>Se aparecer ✗ (vermelho), verifique as credenciais</li>
          </ol>
          <p className="mt-3">
            <strong>Teste real:</strong> Peça a um aluno para fazer um teste de pagamento (pode ser de
            valor mínimo).
          </p>
        </div>
      ),
    },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">📖 Guia de Configuração</h2>
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 font-medium text-gray-900 text-sm"
            >
              {section.title}
              <span className="text-gray-500">{expandedSection === section.id ? '▼' : '▶'}</span>
            </button>
            {expandedSection === section.id && (
              <div className="px-4 py-4 bg-white">{section.content}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
