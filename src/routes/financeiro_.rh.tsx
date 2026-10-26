import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Banknote, BriefcaseBusiness, FileCheck2, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getHrDashboard, listHrPayrollRuns } from "@/features/hr/server";
import { kwanza } from "@/lib/currency";

/**
 * Estados de hr_payroll_runs na base: draft, calculating, review, processing,
 * approved, paid, cancelled. O ecrã testava «processed» (que não existe), pelo
 * que uma folha em revisão ou em processamento aparecia como «cancelada».
 */
const PAYROLL_RUN_BADGE: Record<
  string,
  { status: "paid" | "pending" | "inactive" | "cancelled"; label: string }
> = {
  draft: { status: "inactive", label: "Rascunho" },
  calculating: { status: "pending", label: "Em cálculo" },
  review: { status: "pending", label: "Em revisão" },
  processing: { status: "pending", label: "Em processamento" },
  approved: { status: "paid", label: "Aprovada" },
  paid: { status: "paid", label: "Paga" },
  cancelled: { status: "cancelled", label: "Cancelada" },
};

function payrollRunBadge(status: string) {
  return PAYROLL_RUN_BADGE[status] ?? { status: "pending" as const, label: status };
}

export const Route = createFileRoute("/financeiro_/rh")({
  head: () => ({
    meta: [
      { title: "RH e Folha Salarial · SIGA" },
      {
        name: "description",
        content:
          "Recursos Humanos, contratos, remuneração de funcionários e professores e folhas salariais da escola.",
      },
    ],
  }),
  component: HrPayrollPage,
});

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function HrPayrollPage() {
  const dashboard = useQuery({
    queryKey: ["hr", "dashboard"],
    queryFn: () => getHrDashboard(),
    retry: false,
  });
  const payrolls = useQuery({
    queryKey: ["hr", "payroll-runs"],
    queryFn: () => listHrPayrollRuns(),
    retry: false,
  });

  const data = dashboard.data;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="RH e Folha Salarial"
          description="Vínculos funcionais, contratos, salários mensais, pagamento por hora/aula e processamento da folha salarial — integrado à identidade única de Pessoas."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/financeiro/rh/folha">Processar folha</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro/rh/salarios">Alterações salariais</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro/rh/presenca">Validação de presença</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro/rh/faltas">Faltas e assiduidade</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro">Voltar às Finanças</Link>
              </Button>
            </div>
          }
        />

        {dashboard.isError ? (
          <Panel title="Acesso ao RH">
            <p className="text-sm text-destructive">
              {dashboard.error instanceof Error
                ? dashboard.error.message
                : "Não foi possível carregar o módulo de RH."}
            </p>
          </Panel>
        ) : data && !data.ready ? (
          <Panel title="Fundação do RH pronta para migração">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                A interface está instalada, mas as tabelas de RH ainda não foram encontradas no
                banco de dados desta escola.
              </p>
              <p>
                Aplique as migrations de RH antes de cadastrar vínculos, validar aulas ou processar
                folhas.
              </p>
            </div>
          </Panel>
        ) : (
          <>
            <StatGrid
              items={[
                {
                  label: "Funcionários activos",
                  value: String(data?.employeeCount ?? 0),
                  hint: "Vínculos funcionais activos",
                  icon: Users,
                },
                {
                  label: "Contratos activos",
                  value: String(data?.activeContractCount ?? 0),
                  hint: "Mensal, hora ou hora/aula",
                  icon: BriefcaseBusiness,
                },
                {
                  label: "Folhas em preparação",
                  value: String(data?.payrollDraftCount ?? 0),
                  hint: "Rascunho, cálculo ou revisão",
                  icon: FileCheck2,
                },
                {
                  label: "Último líquido",
                  value: data?.latestPayroll ? kwanza(data.latestPayroll.total_net_kz) : "—",
                  hint: data?.latestPayroll
                    ? `${monthNames[data.latestPayroll.competence_month - 1]} ${data.latestPayroll.competence_year}`
                    : "Nenhuma folha processada",
                  icon: Banknote,
                },
              ]}
            />

            <Panel
              title="Folhas salariais"
              description="Histórico das últimas 36 competências. Os totais permanecem separados do caixa até a etapa de integração financeira/aprovação."
            >
              {payrolls.isLoading ? (
                <p className="text-sm text-muted-foreground">A carregar folhas salariais…</p>
              ) : payrolls.isError ? (
                <p className="text-sm text-destructive">
                  Não foi possível carregar as folhas salariais.
                </p>
              ) : (payrolls.data ?? []).length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  title="Ainda não existem folhas salariais."
                  description="Crie e processe a competência no espaço operacional da folha salarial."
                  compact
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-3 pr-4 font-medium">Competência</th>
                        <th className="py-3 pr-4 font-medium">Estado</th>
                        <th className="py-3 pr-4 text-right font-medium">Bruto</th>
                        <th className="py-3 pr-4 text-right font-medium">Descontos</th>
                        <th className="py-3 text-right font-medium">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payrolls.data ?? []).map((run) => (
                        <tr key={String(run.id)} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">
                            {monthNames[Number(run.competence_month) - 1]}{" "}
                            {String(run.competence_year)}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge
                              status={payrollRunBadge(String(run.status)).status}
                              label={payrollRunBadge(String(run.status)).label}
                            />
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {kwanza(Number(run.total_gross_kz ?? 0))}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {kwanza(Number(run.total_deductions_kz ?? 0))}
                          </td>
                          <td className="py-3 text-right font-semibold">
                            {kwanza(Number(run.total_net_kz ?? 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="Cadastro funcional">
                <p className="text-sm text-muted-foreground">
                  Usa Pessoas como identidade única e adiciona vínculo, departamento, cargo e número
                  funcional sem duplicar professores ou funcionários.
                </p>
              </Panel>
              <Panel title="Professor por hora/aula">
                <p className="text-sm text-muted-foreground">
                  Horário, ocorrência real, check-in e check-out QR ficam separados. Só a aula
                  confirmada produz evento remunerável.
                </p>
              </Panel>
              <Panel title="Folha auditável">
                <p className="text-sm text-muted-foreground">
                  Cada cálculo preserva contrato, período, componentes e eventos remuneráveis.
                  Descontos legais serão configurados de forma versionada antes da produção.
                </p>
              </Panel>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
