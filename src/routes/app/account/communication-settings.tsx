import { VerificationStatus } from "@/components/account/VerificationStatus";

/**
 * Route: /app/account/communication-settings
 *
 * Página de configurações de comunicação e verificação de contactos.
 * Utilizadores podem:
 * - Ver status de verificação (email, SMS, WhatsApp)
 * - Adicionar/remover contactos
 * - Gerenciar preferências de comunicação
 */

export function Route() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Comunicação e Privacidade</h1>
        <p className="text-gray-600 mt-2">
          Gerencie como quer receber notificações e mantenha seus contactos verificados
        </p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-blue-50">
            <h3 className="font-semibold text-sm mb-2">💡 Dica</h3>
            <p className="text-xs text-gray-700">
              Verificar múltiplos contactos garante que você receba notificações importantes, mesmo
              se um canal estiver indisponível.
            </p>
          </div>

          <div className="border rounded-lg p-4 bg-green-50">
            <h3 className="font-semibold text-sm mb-2">🔒 Sua Privacidade</h3>
            <p className="text-xs text-gray-700">
              Mensagens de segurança (como login) são sempre enviadas. Você controla apenas
              notificações de categorias específicas.
            </p>
          </div>
        </div>

        {/* Verification Status Component */}
        <div className="lg:col-span-2">
          <VerificationStatus />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t pt-6">
        <p className="text-xs text-gray-500">
          Última atualização: {new Date().toLocaleDateString("pt-PT")}
        </p>
      </div>
    </div>
  );
}
