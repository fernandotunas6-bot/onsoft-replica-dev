import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { moduleIcons } from "@/lib/app-icons";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { AppyPayPanel } from "@/features/finance/AppyPayPanel";
import { PayflowAdminLaunchButton } from "@/features/finance/components/PayflowAdminLaunchButton";

export const Route = createFileRoute("/financeiro_/conciliacao")({
  head: () => ({
    meta: [
      { title: "Bancos e Conciliação · SIGA Plus" },
      {
        name: "description",
        content: "Cobranças do gateway, extractos importados e conciliação com o PayFlow.",
      },
      { property: "og:title", content: "Bancos e Conciliação · SIGA Plus" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConciliacaoPage,
});

/**
 * Só o que confirma o dinheiro que entrou: as cobranças do gateway, a
 * importação de pagamentos e a conciliação bancária no PayFlow. Viviam
 * espalhadas pela Tesouraria, pelo menu de Caixa e pelo de Facturas.
 */
function ConciliacaoPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Financeiro"
          title="Bancos e Conciliação"
          description="Confirmar no fornecedor o que foi pago antes de o lançar na factura."
          icon={moduleIcons.reconciliation}
          actions={
            <>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/importar" search={{ tab: "novo", modulo: "pagamentos" }}>
                  <FileUp className="size-4" /> Importar pagamentos
                </Link>
              </Button>
              <PayflowAdminLaunchButton variant="outline" className="gap-2">
                Conciliação PayFlow
              </PayflowAdminLaunchButton>
            </>
          }
        />
        <AppyPayPanel />
      </div>
    </AppShell>
  );
}
