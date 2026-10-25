import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import {
  BillingParametersSummary,
  FeePlanSettingsForm,
} from "@/features/school/settings-billing-panel";

/**
 * Propinas e cobranças: o plano de propinas da escola.
 *
 * O plano é a base de toda a cobrança — define a propina mensal, a taxa de
 * matrícula e os preços por classe, e sem um plano activo a emissão de
 * facturas fica bloqueada em `/financeiro` e `/faturas`. Apesar disso, só era
 * alcançável dentro das Configurações da escola, ao lado de parâmetros de
 * instalação, em vez de ter lugar próprio nas Finanças.
 *
 * Esta página não é uma segunda cópia: monta os mesmos componentes do painel de
 * configurações (`settings-billing-panel.tsx`), que continua a funcionar como
 * antes. O que muda é haver um caminho directo para a operação, no contexto
 * financeiro a que ela pertence.
 */
export const Route = createFileRoute("/financeiro/propinas")({
  head: () => ({
    meta: [
      { title: "Propinas e Cobranças · Finanças · SIGA" },
      {
        name: "description",
        content:
          "Plano de propinas da escola: propina mensal, taxa de matrícula e preços por classe.",
      },
    ],
  }),
  component: TuitionPlanPage,
});

function TuitionPlanPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças"
          title="Propinas e Cobranças"
          description="Plano de propinas da escola para o ano lectivo em curso. Os valores aqui definidos são a base das facturas emitidas na tesouraria."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/faturas">Facturas emitidas</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro">Caixa e pagamentos</Link>
              </Button>
            </div>
          }
        />

        <Panel
          title="Plano de propinas"
          description="A propina mensal e a taxa de matrícula aplicam-se a toda a escola. O preço por classe, quando preenchido, substitui a propina geral nessa classe; vazio mantém a geral."
        >
          <FeePlanSettingsForm />
        </Panel>

        <Panel
          title="Parâmetros de cobrança"
          description="Regras que a tesouraria aplica ao emitir e liquidar as facturas deste plano."
        >
          <BillingParametersSummary />
        </Panel>
      </div>
    </AppShell>
  );
}
