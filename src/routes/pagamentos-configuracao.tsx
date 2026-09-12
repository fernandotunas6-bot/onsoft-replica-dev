import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { PaymentConfigurationPanel } from "@/features/payments/PaymentConfigurationPanel";

export const Route = createFileRoute("/pagamentos-configuracao")({
  head: () => ({
    meta: [
      { title: "Configuração de Pagamentos · SIGA" },
      {
        name: "description",
        content: "Conecte a conta AppyPay da sua escola para receber mensalidades diretamente.",
      },
    ],
  }),
  component: PagamentosConfiguracaoPage,
});

function PagamentosConfiguracaoPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Financeiro"
          title="Configuração de Pagamentos"
          description="Conecte a conta AppyPay da sua escola para receber mensalidades de alunos diretamente."
        />
        <PaymentConfigurationPanel />
      </div>
    </AppShell>
  );
}
