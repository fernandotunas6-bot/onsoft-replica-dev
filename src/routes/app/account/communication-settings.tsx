import { PageHeader } from "@/components/layout/PageHeader";
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
      <PageHeader
        group="Conta"
        title="Comunicação e Privacidade"
        description="Gerencie como quer receber notificações e mantenha seus contactos verificados."
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-xs">
            <h3 className="font-semibold text-sm mb-2 text-foreground">💡 Dica</h3>
            <p className="text-xs text-muted-foreground">
              Verificar múltiplos contactos garante que você receba notificações importantes, mesmo
              se um canal estiver indisponível.
            </p>
          </div>

          <div className="rounded-xl border border-success/20 bg-success/5 p-4 shadow-xs">
            <h3 className="font-semibold text-sm mb-2 text-foreground">🔒 Sua Privacidade</h3>
            <p className="text-xs text-muted-foreground">
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
      <div className="border-t border-border pt-6">
        <p className="text-xs text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString("pt-PT")}
        </p>
      </div>
    </div>
  );
}
