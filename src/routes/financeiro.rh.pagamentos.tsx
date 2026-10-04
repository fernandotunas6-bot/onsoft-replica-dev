import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCheck,
  CreditCard,
  FileCheck2,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
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
  authorizePayrollPaymentBatch,
  confirmPayrollPaymentItem,
  createPayrollPaymentBatch,
  getPayrollPaymentBatchDetail,
  listPayrollPaymentBatches,
  refreshPayrollPaymentBatch,
  reversePayrollPaymentItem,
  upsertHrPaymentDestination,
} from "@/features/hr/payments";
import { kwanza } from "@/lib/currency";

export const Route = createFileRoute("/financeiro/rh/pagamentos")({
  head: () => ({ meta: [{ title: "Ordens de Pagamento · RH · SIGA" }] }),
  component: PayrollPaymentsPage,
});

type DestinationDraft = {
  employmentId: string;
  beneficiaryName: string;
  method: "transfer" | "cash" | "other";
  bankName: string;
  iban: string;
  accountNumber: string;
  destinationReference: string;
};

type ExecutionDraft = {
  paymentItemId: string;
  beneficiaryName: string;
  amountKz: number;
  result: "paid" | "failed";
  reference: string;
  failureReason: string;
};

type ReversalDraft = {
  paymentItemId: string;
  beneficiaryName: string;
  amountKz: number;
  reason: string;
  next: "repay" | "cancel";
};

function PayrollPaymentsPage() {
  const queryClient = useQueryClient();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [destinationDraft, setDestinationDraft] = useState<DestinationDraft | null>(null);
  const [executionDraft, setExecutionDraft] = useState<ExecutionDraft | null>(null);
  const [reversalDraft, setReversalDraft] = useState<ReversalDraft | null>(null);

  const runs = useQuery({
    queryKey: ["hr", "payroll-runs"],
    queryFn: () => listHrPayrollRuns(),
    retry: false,
  });
  const batches = useQuery({
    queryKey: ["hr", "payment-batches"],
    queryFn: () => listPayrollPaymentBatches(),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["hr", "payment-batch", selectedBatchId],
    queryFn: () => getPayrollPaymentBatchDetail({ data: { batchId: selectedBatchId! } }),
    enabled: Boolean(selectedBatchId),
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr", "payment-batches"] });
    await queryClient.invalidateQueries({ queryKey: ["hr", "payroll-runs"] });
    if (selectedBatchId)
      await queryClient.invalidateQueries({ queryKey: ["hr", "payment-batch", selectedBatchId] });
  };

  const createBatch = useMutation({
    mutationFn: (payrollRunId: string) => createPayrollPaymentBatch({ data: { payrollRunId } }),
    onSuccess: async (result) => {
      const row = Array.isArray(result) ? result[0] : result;
      const id = row && typeof row === "object" && "id" in row ? String(row.id) : null;
      if (id) setSelectedBatchId(id);
      toast.success("Ordem salarial preparada.");
      await refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível preparar a ordem salarial.",
      ),
  });

  const syncBatch = useMutation({
    mutationFn: (batchId: string) => refreshPayrollPaymentBatch({ data: { batchId } }),
    onSuccess: async () => {
      toast.success("Beneficiários sincronizados.");
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível sincronizar o lote."),
  });

  const authorize = useMutation({
    mutationFn: (batchId: string) => authorizePayrollPaymentBatch({ data: { batchId } }),
    onSuccess: async () => {
      toast.success("Ordem salarial autorizada.", {
        description: "A autorização não executa a transferência nem lança saída de caixa.",
      });
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível autorizar a ordem."),
  });

  const saveDestination = useMutation({
    mutationFn: (value: DestinationDraft) => upsertHrPaymentDestination({ data: value }),
    onSuccess: async () => {
      toast.success("Destino de pagamento guardado.");
      setDestinationDraft(null);
      if (selectedBatchId) await syncBatch.mutateAsync(selectedBatchId);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar o destino."),
  });

  const confirmPayment = useMutation({
    mutationFn: (value: ExecutionDraft) =>
      confirmPayrollPaymentItem({
        data: {
          paymentItemId: value.paymentItemId,
          result: value.result,
          reference: value.reference,
          failureReason: value.failureReason,
        },
      }),
    onSuccess: async (result) => {
      if (result.paid) {
        toast.success(
          result.batchCompleted ? "Folha totalmente paga." : "Pagamento salarial confirmado.",
          {
            description: "A saída de caixa foi registrada apenas após esta confirmação.",
          },
        );
      } else {
        toast.info("Falha de pagamento registrada.", {
          description: "Nenhuma saída de caixa foi criada para este item.",
        });
      }
      setExecutionDraft(null);
      await refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o resultado do pagamento.",
      ),
  });

  const reversePayment = useMutation({
    mutationFn: (value: ReversalDraft) =>
      reversePayrollPaymentItem({
        data: { paymentItemId: value.paymentItemId, reason: value.reason, next: value.next },
      }),
    onSuccess: async (result) => {
      toast.success("Pagamento salarial anulado.", {
        description:
          result.itemStatus === "authorized"
            ? "A saída de caixa foi anulada e o salário pode ser pago de novo."
            : "A saída de caixa foi anulada e o salário ficou cancelado.",
      });
      setReversalDraft(null);
      await refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível anular o pagamento salarial.",
      ),
  });

  const approvedRuns = useMemo(
    () => (runs.data ?? []).filter((run) => String(run.status) === "approved"),
    [runs.data],
  );
  const selected = detail.data?.batch ?? null;
  const items = detail.data?.items ?? [];
  const blocked = items.filter((item) => String(item.status) === "blocked");
  const paid = items.filter((item) => String(item.status) === "paid");
  const payable = items.filter((item) =>
    ["pending", "authorized", "processing", "failed", "paid"].includes(String(item.status)),
  );
  const executableBatch =
    selected && ["authorized", "processing", "partial"].includes(String(selected.status));

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="Ordens de Pagamento Salarial"
          description="Transforme apenas folhas aprovadas em ordens salariais. Resolva beneficiários, aplique controlo duplo e confirme a execução antes de lançar qualquer saída no caixa."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/financeiro/rh/folha">Folha salarial</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/financeiro/rh">Voltar ao RH</Link>
              </Button>
            </div>
          }
        />

        <Panel
          title="Folhas aprovadas"
          description="Aprovar a folha congela o cálculo; esta etapa apenas prepara uma ordem de pagamento."
        >
          {approvedRuns.length === 0 ? (
            <EmptyState
              icon={FileCheck2}
              title="Nenhuma folha aprovada disponível"
              description="Só folhas já calculadas e aprovadas podem gerar uma ordem salarial. Aprove a competência no processamento da folha."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/financeiro/rh/folha">Ir para o processamento da folha</Link>
                </Button>
              }
              compact
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {approvedRuns.map((run) => (
                <Button
                  key={String(run.id)}
                  variant="outline"
                  disabled={createBatch.isPending}
                  onClick={() => createBatch.mutate(String(run.id))}
                >
                  Preparar {String(run.competence_month).padStart(2, "0")}/
                  {String(run.competence_year)} · {kwanza(Number(run.total_net_kz ?? 0))}
                </Button>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Panel title="Ordens" description="Histórico de lotes salariais.">
            {batches.isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar ordens…</p>
            ) : (batches.data ?? []).length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Ainda não existem ordens salariais"
                description="Prepare uma ordem a partir de uma folha aprovada para reunir os beneficiários e o controlo duplo de autorização."
                compact
              />
            ) : (
              <div className="space-y-2">
                {(batches.data ?? []).map((batch) => (
                  <button
                    key={String(batch.id)}
                    type="button"
                    onClick={() => setSelectedBatchId(String(batch.id))}
                    className="w-full rounded-lg border p-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{String(batch.batch_number)}</span>
                      <span className="text-xs text-muted-foreground">{String(batch.status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {kwanza(Number(batch.total_amount_kz ?? 0))} ·{" "}
                      {Number(batch.blocked_count ?? 0)} bloqueado(s)
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          {!selectedBatchId ? (
            <Panel title="Selecione uma ordem">
              <EmptyState
                icon={MousePointerClick}
                title="Nenhuma ordem seleccionada"
                description="Escolha um lote salarial na lista à esquerda para rever beneficiários, destinos de pagamento e autorizações."
                compact
              />
            </Panel>
          ) : detail.isLoading ? (
            <Panel title="A carregar">
              <p className="text-sm text-muted-foreground">A carregar ordem salarial…</p>
            </Panel>
          ) : !selected ? (
            <Panel title="Ordem indisponível">
              <p className="text-sm text-destructive">Não foi possível carregar esta ordem.</p>
            </Panel>
          ) : (
            <div className="space-y-4">
              <StatGrid
                items={[
                  {
                    label: "Total",
                    value: kwanza(Number(selected.total_amount_kz ?? 0)),
                    hint: String(selected.batch_number),
                    icon: WalletCards,
                  },
                  {
                    label: "Pagáveis",
                    value: String(payable.length),
                    hint: "Com destino configurado",
                    icon: CreditCard,
                  },
                  {
                    label: "Pagos",
                    value: String(paid.length),
                    hint: "Com saída de caixa confirmada",
                    icon: CheckCheck,
                  },
                  {
                    label: "Bloqueados",
                    value: String(blocked.length),
                    hint: "Precisam de destino",
                    icon: AlertTriangle,
                  },
                ]}
              />

              <Panel
                title={String(selected.batch_number)}
                description={`Estado: ${String(selected.status)} · método: ${String(selected.method)}`}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncBatch.mutate(String(selected.id))}
                      disabled={
                        syncBatch.isPending ||
                        !["draft", "awaiting_authorization"].includes(String(selected.status))
                      }
                    >
                      <RefreshCw className="mr-2 size-4" aria-hidden="true" />
                      Sincronizar
                    </Button>
                    {String(selected.status) === "awaiting_authorization" &&
                    blocked.length === 0 ? (
                      <Button
                        size="sm"
                        onClick={() => authorize.mutate(String(selected.id))}
                        disabled={authorize.isPending}
                      >
                        <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
                        Autorizar ordem
                      </Button>
                    ) : null}
                  </div>
                }
              >
                <p className="text-sm text-muted-foreground">
                  Por padrão o controlo duplo exige que quem autoriza seja diferente de quem
                  preparou. A autorização continua sem movimentar dinheiro.
                </p>
              </Panel>

              <Panel
                title="Beneficiários"
                description="Dados bancários completos não são exibidos nesta lista; apenas referências mascaradas. O botão de confirmação representa o retorno bancário ou conferência manual, não o envio da transferência."
              >
                <div className="space-y-2">
                  {items.map((item) => {
                    const status = String(item.status);
                    const canRecordResult =
                      Boolean(executableBatch) &&
                      ["authorized", "processing", "failed"].includes(status);
                    return (
                      <div
                        key={String(item.id)}
                        className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                      >
                        <div>
                          <p className="font-medium">{String(item.beneficiary_name)}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.destination_label
                              ? String(item.destination_label)
                              : String(item.block_reason ?? "Destino pendente")}{" "}
                            · {status}
                            {item.provider_reference
                              ? ` · Ref. ${String(item.provider_reference)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            {kwanza(Number(item.amount_kz ?? 0))}
                          </span>
                          {status === "blocked" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setDestinationDraft({
                                  employmentId: String(item.employment_id),
                                  beneficiaryName: String(item.beneficiary_name),
                                  method: "transfer",
                                  bankName: "",
                                  iban: "",
                                  accountNumber: "",
                                  destinationReference: "",
                                })
                              }
                            >
                              Configurar destino
                            </Button>
                          ) : null}
                          {status === "paid" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setReversalDraft({
                                  paymentItemId: String(item.id),
                                  beneficiaryName: String(item.beneficiary_name),
                                  amountKz: Number(item.amount_kz ?? 0),
                                  reason: "",
                                  next: "repay",
                                })
                              }
                            >
                              Anular pagamento
                            </Button>
                          ) : null}
                          {canRecordResult ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() =>
                                  setExecutionDraft({
                                    paymentItemId: String(item.id),
                                    beneficiaryName: String(item.beneficiary_name),
                                    amountKz: Number(item.amount_kz ?? 0),
                                    result: "paid",
                                    reference: "",
                                    failureReason: "",
                                  })
                                }
                              >
                                Confirmar pago
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setExecutionDraft({
                                    paymentItemId: String(item.id),
                                    beneficiaryName: String(item.beneficiary_name),
                                    amountKz: Number(item.amount_kz ?? 0),
                                    result: "failed",
                                    reference: "",
                                    failureReason: "",
                                  })
                                }
                              >
                                Registar falha
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {destinationDraft ? (
                <Panel
                  title={`Destino de ${destinationDraft.beneficiaryName}`}
                  description="O IBAN é guardado no domínio RH com RLS restrita; a listagem administrativa apresenta apenas os últimos quatro caracteres."
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>Método</span>
                      <select
                        aria-label="Método do destino salarial"
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={destinationDraft.method}
                        onChange={(event) =>
                          setDestinationDraft({
                            ...destinationDraft,
                            method: event.target.value as DestinationDraft["method"],
                          })
                        }
                      >
                        <option value="transfer">Transferência</option>
                        <option value="cash">Numerário</option>
                        <option value="other">Outro</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Banco</span>
                      <Input
                        aria-label="Banco do beneficiário"
                        value={destinationDraft.bankName}
                        onChange={(event) =>
                          setDestinationDraft({ ...destinationDraft, bankName: event.target.value })
                        }
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>IBAN</span>
                      <Input
                        aria-label="IBAN do beneficiário"
                        value={destinationDraft.iban}
                        onChange={(event) =>
                          setDestinationDraft({ ...destinationDraft, iban: event.target.value })
                        }
                        autoComplete="off"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Número de conta</span>
                      <Input
                        aria-label="Número de conta do beneficiário"
                        value={destinationDraft.accountNumber}
                        onChange={(event) =>
                          setDestinationDraft({
                            ...destinationDraft,
                            accountNumber: event.target.value,
                          })
                        }
                        autoComplete="off"
                      />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span>Referência alternativa</span>
                      <Input
                        aria-label="Referência alternativa do destino"
                        value={destinationDraft.destinationReference}
                        onChange={(event) =>
                          setDestinationDraft({
                            ...destinationDraft,
                            destinationReference: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDestinationDraft(null)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => saveDestination.mutate(destinationDraft)}
                      disabled={saveDestination.isPending}
                    >
                      {saveDestination.isPending ? "A guardar…" : "Guardar destino"}
                    </Button>
                  </div>
                </Panel>
              ) : null}

              {executionDraft ? (
                <Panel
                  title={`${executionDraft.result === "paid" ? "Confirmar pagamento" : "Registar falha"} · ${executionDraft.beneficiaryName}`}
                  description={`${kwanza(executionDraft.amountKz)} · A referência deve vir do banco, ficheiro processado ou comprovativo/conferência manual.`}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>Resultado</span>
                      <select
                        aria-label="Resultado da execução salarial"
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={executionDraft.result}
                        onChange={(event) =>
                          setExecutionDraft({
                            ...executionDraft,
                            result: event.target.value as ExecutionDraft["result"],
                          })
                        }
                      >
                        <option value="paid">Pago/confirmado</option>
                        <option value="failed">Falhou</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Referência</span>
                      <Input
                        aria-label="Referência do pagamento salarial"
                        value={executionDraft.reference}
                        onChange={(event) =>
                          setExecutionDraft({ ...executionDraft, reference: event.target.value })
                        }
                        placeholder="Referência bancária ou comprovativo"
                        autoComplete="off"
                      />
                    </label>
                    {executionDraft.result === "failed" ? (
                      <label className="space-y-1 text-sm md:col-span-2">
                        <span>Motivo da falha</span>
                        <Input
                          aria-label="Motivo da falha do pagamento salarial"
                          value={executionDraft.failureReason}
                          onChange={(event) =>
                            setExecutionDraft({
                              ...executionDraft,
                              failureReason: event.target.value,
                            })
                          }
                          placeholder="Ex.: conta inválida ou transferência rejeitada"
                        />
                      </label>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Se marcar como pago, o SIGA criará uma saída financeira de categoria Salários.
                    Se marcar como falha, nenhuma saída será criada.
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setExecutionDraft(null)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => confirmPayment.mutate(executionDraft)}
                      disabled={
                        confirmPayment.isPending ||
                        executionDraft.reference.trim().length < 3 ||
                        (executionDraft.result === "failed" &&
                          executionDraft.failureReason.trim().length < 3)
                      }
                    >
                      {confirmPayment.isPending
                        ? "A registar…"
                        : executionDraft.result === "paid"
                          ? "Confirmar e lançar no caixa"
                          : "Registar falha"}
                    </Button>
                  </div>
                </Panel>
              ) : null}

              {reversalDraft ? (
                <Panel
                  title={`Anular pagamento · ${reversalDraft.beneficiaryName}`}
                  description={`${kwanza(reversalDraft.amountKz)} · Para um salário pago por engano. A saída de caixa é anulada com o mesmo motivo e a folha volta atrás, tudo de uma vez. Exige 2FA.`}
                >
                  <div className="grid gap-3">
                    <label className="space-y-1 text-sm">
                      <span>Motivo</span>
                      <Input
                        aria-label="Motivo da anulação do pagamento salarial"
                        value={reversalDraft.reason}
                        onChange={(event) =>
                          setReversalDraft({ ...reversalDraft, reason: event.target.value })
                        }
                        placeholder="Ex.: transferido para o IBAN errado"
                        maxLength={500}
                      />
                    </label>
                    <fieldset className="space-y-2 text-sm">
                      <legend className="font-medium">Depois de anular</legend>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="reversal-next"
                          checked={reversalDraft.next === "repay"}
                          onChange={() => setReversalDraft({ ...reversalDraft, next: "repay" })}
                        />
                        Voltar a pagar (o salário é devido; ex.: destino errado)
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="reversal-next"
                          checked={reversalDraft.next === "cancel"}
                          onChange={() => setReversalDraft({ ...reversalDraft, next: "cancel" })}
                        />
                        Cancelar (o salário não era devido)
                      </label>
                    </fieldset>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setReversalDraft(null)}>
                      Voltar
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => reversePayment.mutate(reversalDraft)}
                      disabled={reversePayment.isPending || reversalDraft.reason.trim().length < 5}
                    >
                      {reversePayment.isPending ? "A anular…" : "Anular pagamento"}
                    </Button>
                  </div>
                </Panel>
              ) : null}

              {String(selected.status) === "authorized" ? (
                <Panel
                  title="Pronto para execução financeira"
                  description="A ordem está autorizada; confirme os resultados somente depois de receber retorno da instituição bancária ou evidência manual válida."
                >
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCheck className="mt-0.5 size-4" aria-hidden="true" />
                    <p>
                      Uma futura integração bancária poderá preencher estas confirmações
                      automaticamente. Até lá, a execução externa continua fora do SIGA e o operador
                      registra apenas o resultado confirmado.
                    </p>
                  </div>
                </Panel>
              ) : null}

              {String(selected.status) === "completed" ? (
                <Panel
                  title="Ordem concluída"
                  description="Todos os itens foram confirmados como pagos."
                >
                  <p className="text-sm text-muted-foreground">
                    A competência correspondente foi marcada como paga e cada item possui ligação à
                    saída salarial lançada no caixa.
                  </p>
                </Panel>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
