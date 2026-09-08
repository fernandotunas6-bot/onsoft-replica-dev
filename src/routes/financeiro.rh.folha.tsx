import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  Calculator,
  CheckCheck,
  FileSpreadsheet,
  MousePointerClick,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { listHrPayrollRuns } from "@/features/hr/server";
import {
  approvePayrollRun,
  calculatePayrollRun,
  createPayrollRun,
  getPayrollRunDetail,
} from "@/features/hr/payroll";
import { kwanza } from "@/lib/currency";

export const Route = createFileRoute("/financeiro/rh/folha")({
  head: () => ({ meta: [{ title: "Processamento da Folha · RH · SIGA" }] }),
  component: PayrollOperationsPage,
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

function currentLuandaCompetence() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? new Date().getFullYear()),
    month: Number(parts.find((part) => part.type === "month")?.value ?? new Date().getMonth() + 1),
  };
}

function PayrollOperationsPage() {
  const queryClient = useQueryClient();
  const initial = currentLuandaCompetence();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [notes, setNotes] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["hr", "payroll-runs"],
    queryFn: () => listHrPayrollRuns(),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["hr", "payroll-detail", selectedRunId],
    queryFn: () => getPayrollRunDetail({ data: { payrollRunId: selectedRunId! } }),
    enabled: Boolean(selectedRunId),
    retry: false,
  });
  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr", "payroll-runs"] });
    if (selectedRunId)
      await queryClient.invalidateQueries({ queryKey: ["hr", "payroll-detail", selectedRunId] });
  };
  const createRun = useMutation({
    mutationFn: () => createPayrollRun({ data: { year, month, notes } }),
    onSuccess: async (result) => {
      const row = Array.isArray(result) ? result[0] : result;
      const id = row && typeof row === "object" && "id" in row ? String(row.id) : null;
      if (id) setSelectedRunId(id);
      toast.success("Competência salarial preparada.");
      await refreshAll();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a competência."),
  });
  const calculate = useMutation({
    mutationFn: (payrollRunId: string) => calculatePayrollRun({ data: { payrollRunId } }),
    onSuccess: async (result) => {
      const skipped = Number(result?.skipped_items ?? 0);
      toast.success("Cálculo concluído", {
        description:
          skipped > 0
            ? `${skipped} vínculo(s) ficaram fora do cálculo e precisam de revisão.`
            : "Todos os vínculos elegíveis foram calculados.",
      });
      await refreshAll();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível calcular a folha."),
  });
  const approve = useMutation({
    mutationFn: (payrollRunId: string) => approvePayrollRun({ data: { payrollRunId } }),
    onSuccess: async () => {
      toast.success("Folha salarial aprovada e bloqueada para alterações de cálculo.");
      await refreshAll();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível aprovar a folha."),
  });
  const selected = detail.data?.run ?? null;
  const items = detail.data?.items ?? [];
  const totalBase = useMemo(() => items.reduce((sum, item) => sum + item.baseAmountKz, 0), [items]);
  const totalVariable = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + item.hourlyAmountKz + item.allowancesKz + item.bonusesKz + item.overtimeKz,
        0,
      ),
    [items],
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="Processamento da Folha Salarial"
          description="Crie a competência, calcule mensalistas, horistas, hora/aula e híbridos, reveja os valores e aprove apenas quando a folha estiver consistente."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/financeiro/rh/pagamentos">Ordens de pagamento</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/financeiro/rh/faltas">Faltas</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/financeiro/rh">Voltar ao RH</Link>
              </Button>
            </div>
          }
        />
        <Panel
          title="Nova competência"
          description="Uma única folha por escola/mês. Se a competência já existir, ela será apenas selecionada."
        >
          <div className="grid gap-3 md:grid-cols-[140px_180px_1fr_auto] md:items-end">
            <label className="space-y-1 text-sm">
              <span>Ano</span>
              <Input
                aria-label="Ano da competência"
                type="number"
                min={2000}
                max={2200}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Mês</span>
              <select
                aria-label="Mês da competência"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {monthNames.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Notas</span>
              <Input
                aria-label="Notas da competência"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações opcionais da competência"
              />
            </label>
            <Button onClick={() => createRun.mutate()} disabled={createRun.isPending}>
              {createRun.isPending ? "A preparar…" : "Preparar folha"}
            </Button>
          </div>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Panel title="Competências" description="Selecione uma folha para calcular ou rever.">
            {runs.isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar competências…</p>
            ) : runs.isError ? (
              <p className="text-sm text-destructive">Não foi possível carregar as folhas.</p>
            ) : (runs.data ?? []).length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="Ainda não existem folhas salariais"
                description={`Prepare a competência de ${monthNames[month - 1]} ${year} para calcular mensalistas, horistas e hora/aula desta escola.`}
                action={
                  <Button
                    size="sm"
                    onClick={() => createRun.mutate()}
                    disabled={createRun.isPending}
                  >
                    {createRun.isPending ? "A preparar…" : "Preparar folha"}
                  </Button>
                }
                compact
              />
            ) : (
              <div className="space-y-2">
                {(runs.data ?? []).map((run) => {
                  const id = String(run.id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedRunId(id)}
                      className="w-full rounded-lg border p-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {monthNames[Number(run.competence_month) - 1]}{" "}
                          {String(run.competence_year)}
                        </span>
                        <span className="text-xs text-muted-foreground">{String(run.status)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {kwanza(Number(run.total_net_kz ?? 0))}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
          <div className="space-y-4">
            {!selectedRunId ? (
              <Panel title="Selecione uma competência">
                <EmptyState
                  icon={MousePointerClick}
                  title="Nenhuma competência seleccionada"
                  description="Escolha uma folha na lista à esquerda para calcular, rever e aprovar o processamento salarial."
                  compact
                />
              </Panel>
            ) : detail.isLoading ? (
              <Panel title="A carregar">
                <p className="text-sm text-muted-foreground">A carregar detalhe da folha…</p>
              </Panel>
            ) : detail.isError || !selected ? (
              <Panel title="Folha indisponível">
                <p className="text-sm text-destructive">Não foi possível carregar esta folha.</p>
              </Panel>
            ) : (
              <>
                <StatGrid
                  items={[
                    {
                      label: "Bruto",
                      value: kwanza(selected.totalGrossKz),
                      hint: "Base + componentes variáveis",
                      icon: WalletCards,
                    },
                    {
                      label: "Descontos",
                      value: kwanza(selected.totalDeductionsKz),
                      hint: "Inclui faltas validadas; impostos legais ainda não configurados",
                      icon: FileSpreadsheet,
                    },
                    {
                      label: "Líquido",
                      value: kwanza(selected.totalNetKz),
                      hint: `${items.length} item(ns) calculado(s)`,
                      icon: CheckCheck,
                    },
                  ]}
                />
                <Panel
                  title={`${monthNames[selected.competenceMonth - 1]} ${selected.competenceYear}`}
                  description={`Estado: ${selected.status} · Período ${selected.periodStart} a ${selected.periodEnd}`}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void detail.refetch()}
                        disabled={detail.isFetching}
                      >
                        <RefreshCw className="mr-2 size-4" aria-hidden="true" />
                        Actualizar
                      </Button>
                      {["draft", "calculating", "review"].includes(selected.status) ? (
                        <Button
                          size="sm"
                          onClick={() => calculate.mutate(selected.id)}
                          disabled={calculate.isPending}
                        >
                          <Calculator className="mr-2 size-4" aria-hidden="true" />
                          {calculate.isPending
                            ? "A calcular…"
                            : items.length
                              ? "Recalcular"
                              : "Calcular folha"}
                        </Button>
                      ) : null}
                      {selected.status === "review" && items.length > 0 ? (
                        <Button
                          size="sm"
                          onClick={() => approve.mutate(selected.id)}
                          disabled={approve.isPending}
                        >
                          <CheckCheck className="mr-2 size-4" aria-hidden="true" />
                          {approve.isPending ? "A aprovar…" : "Aprovar e bloquear"}
                        </Button>
                      ) : null}
                      {selected.status === "approved" ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/financeiro/rh/pagamentos">Preparar pagamento</Link>
                        </Button>
                      ) : null}
                    </div>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Salário-base total</p>
                      <p className="mt-1 font-semibold">{kwanza(totalBase)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Variáveis e adicionais</p>
                      <p className="mt-1 font-semibold">{kwanza(totalVariable)}</p>
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="Itens da folha"
                  description="Detalhe por funcionário/professor antes da aprovação final."
                >
                  {items.length === 0 ? (
                    <EmptyState
                      icon={Calculator}
                      title="A folha ainda não foi calculada"
                      description="Execute o cálculo da competência para gerar os itens por funcionário e professor a partir dos vínculos activos."
                      action={
                        ["draft", "calculating", "review"].includes(selected.status) ? (
                          <Button
                            size="sm"
                            onClick={() => calculate.mutate(selected.id)}
                            disabled={calculate.isPending}
                          >
                            <Calculator className="mr-2 size-4" aria-hidden="true" />
                            {calculate.isPending ? "A calcular…" : "Calcular folha"}
                          </Button>
                        ) : undefined
                      }
                      compact
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-3 pr-4">Pessoa</th>
                            <th className="py-3 pr-4">Modelo</th>
                            <th className="py-3 pr-4 text-right">Base</th>
                            <th className="py-3 pr-4 text-right">Variável</th>
                            <th className="py-3 pr-4 text-right">Descontos</th>
                            <th className="py-3 text-right">Líquido</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => {
                            const variable =
                              item.hourlyAmountKz +
                              item.allowancesKz +
                              item.bonusesKz +
                              item.overtimeKz;
                            return (
                              <tr key={item.id} className="border-b last:border-0">
                                <td className="py-3 pr-4">
                                  <p className="font-medium">{item.personName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.employeeNumber ? `Nº ${item.employeeNumber} · ` : ""}
                                    {item.status}
                                  </p>
                                </td>
                                <td className="py-3 pr-4 text-muted-foreground">
                                  {item.remunerationModel ?? item.salaryType ?? "—"}
                                </td>
                                <td className="py-3 pr-4 text-right">
                                  {kwanza(item.baseAmountKz)}
                                </td>
                                <td className="py-3 pr-4 text-right">{kwanza(variable)}</td>
                                <td className="py-3 pr-4 text-right">
                                  {kwanza(item.deductionsKz)}
                                </td>
                                <td className="py-3 text-right font-semibold">
                                  {kwanza(item.netAmountKz)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
