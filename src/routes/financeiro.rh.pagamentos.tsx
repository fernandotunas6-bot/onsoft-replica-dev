import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCheck, CreditCard, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listHrPayrollRuns } from "@/features/hr/server";
import {
  authorizePayrollPaymentBatch,
  createPayrollPaymentBatch,
  getPayrollPaymentBatchDetail,
  listPayrollPaymentBatches,
  refreshPayrollPaymentBatch,
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

function PayrollPaymentsPage() {
  const queryClient = useQueryClient();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [destinationDraft, setDestinationDraft] = useState<DestinationDraft | null>(null);

  const runs = useQuery({ queryKey: ["hr", "payroll-runs"], queryFn: () => listHrPayrollRuns(), retry: false });
  const batches = useQuery({ queryKey: ["hr", "payment-batches"], queryFn: () => listPayrollPaymentBatches(), retry: false });
  const detail = useQuery({
    queryKey: ["hr", "payment-batch", selectedBatchId],
    queryFn: () => getPayrollPaymentBatchDetail({ data: { batchId: selectedBatchId! } }),
    enabled: Boolean(selectedBatchId),
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr", "payment-batches"] });
    if (selectedBatchId) await queryClient.invalidateQueries({ queryKey: ["hr", "payment-batch", selectedBatchId] });
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
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível preparar a ordem salarial."),
  });

  const syncBatch = useMutation({
    mutationFn: (batchId: string) => refreshPayrollPaymentBatch({ data: { batchId } }),
    onSuccess: async () => {
      toast.success("Beneficiários sincronizados.");
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível sincronizar o lote."),
  });

  const authorize = useMutation({
    mutationFn: (batchId: string) => authorizePayrollPaymentBatch({ data: { batchId } }),
    onSuccess: async () => {
      toast.success("Ordem salarial autorizada.", { description: "A autorização não executa a transferência nem lança saída de caixa." });
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível autorizar a ordem."),
  });

  const saveDestination = useMutation({
    mutationFn: (value: DestinationDraft) => upsertHrPaymentDestination({ data: value }),
    onSuccess: async () => {
      toast.success("Destino de pagamento guardado.");
      setDestinationDraft(null);
      if (selectedBatchId) await syncBatch.mutateAsync(selectedBatchId);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível guardar o destino."),
  });

  const approvedRuns = useMemo(() => (runs.data ?? []).filter((run) => String(run.status) === "approved"), [runs.data]);
  const selected = detail.data?.batch ?? null;
  const items = detail.data?.items ?? [];
  const blocked = items.filter((item) => String(item.status) === "blocked");
  const payable = items.filter((item) => ["pending", "authorized", "processing", "paid"].includes(String(item.status)));

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="Ordens de Pagamento Salarial"
          description="Transforme apenas folhas aprovadas em ordens salariais. Resolva beneficiários, aplique controlo duplo e só depois encaminhe para execução financeira."
          actions={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/financeiro/rh/folha">Folha salarial</Link></Button><Button variant="outline" asChild><Link to="/financeiro/rh">Voltar ao RH</Link></Button></div>}
        />

        <Panel title="Folhas aprovadas" description="Aprovar a folha congela o cálculo; esta etapa apenas prepara uma ordem de pagamento.">
          {approvedRuns.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma folha aprovada disponível para ordem salarial.</p> : (
            <div className="flex flex-wrap gap-2">{approvedRuns.map((run) => <Button key={String(run.id)} variant="outline" disabled={createBatch.isPending} onClick={() => createBatch.mutate(String(run.id))}>Preparar {String(run.competence_month).padStart(2, "0")}/{String(run.competence_year)} · {kwanza(Number(run.total_net_kz ?? 0))}</Button>)}</div>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Panel title="Ordens" description="Histórico de lotes salariais.">
            {batches.isLoading ? <p className="text-sm text-muted-foreground">A carregar ordens…</p> : (batches.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Ainda não existem ordens salariais.</p> : <div className="space-y-2">{(batches.data ?? []).map((batch) => <button key={String(batch.id)} type="button" onClick={() => setSelectedBatchId(String(batch.id))} className="w-full rounded-lg border p-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-center justify-between gap-2"><span className="font-medium">{String(batch.batch_number)}</span><span className="text-xs text-muted-foreground">{String(batch.status)}</span></div><p className="mt-1 text-sm text-muted-foreground">{kwanza(Number(batch.total_amount_kz ?? 0))} · {Number(batch.blocked_count ?? 0)} bloqueado(s)</p></button>)}</div>}
          </Panel>

          {!selectedBatchId ? <Panel title="Selecione uma ordem"><p className="text-sm text-muted-foreground">Escolha um lote salarial para rever os beneficiários.</p></Panel> : detail.isLoading ? <Panel title="A carregar"><p className="text-sm text-muted-foreground">A carregar ordem salarial…</p></Panel> : !selected ? <Panel title="Ordem indisponível"><p className="text-sm text-destructive">Não foi possível carregar esta ordem.</p></Panel> : (
            <div className="space-y-4">
              <StatGrid items={[
                { label: "Total", value: kwanza(Number(selected.total_amount_kz ?? 0)), hint: String(selected.batch_number), icon: WalletCards },
                { label: "Pagáveis", value: String(payable.length), hint: "Com destino configurado", icon: CreditCard },
                { label: "Bloqueados", value: String(blocked.length), hint: "Precisam de destino", icon: AlertTriangle },
              ]} />

              <Panel title={String(selected.batch_number)} description={`Estado: ${String(selected.status)} · método: ${String(selected.method)}`} action={<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => syncBatch.mutate(String(selected.id))} disabled={syncBatch.isPending || !["draft", "awaiting_authorization"].includes(String(selected.status))}><RefreshCw className="mr-2 size-4" aria-hidden="true" />Sincronizar</Button>{String(selected.status) === "awaiting_authorization" && blocked.length === 0 ? <Button size="sm" onClick={() => authorize.mutate(String(selected.id))} disabled={authorize.isPending}><ShieldCheck className="mr-2 size-4" aria-hidden="true" />Autorizar ordem</Button> : null}</div>}>
                <p className="text-sm text-muted-foreground">Por padrão o controlo duplo exige que quem autoriza seja diferente de quem preparou. A autorização continua sem movimentar dinheiro.</p>
              </Panel>

              <Panel title="Beneficiários" description="Dados bancários completos não são exibidos nesta lista; apenas referências mascaradas.">
                <div className="space-y-2">{items.map((item) => <div key={String(item.id)} className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"><div><p className="font-medium">{String(item.beneficiary_name)}</p><p className="text-xs text-muted-foreground">{item.destination_label ? String(item.destination_label) : String(item.block_reason ?? "Destino pendente")} · {String(item.status)}</p></div><div className="flex items-center gap-2"><span className="font-semibold">{kwanza(Number(item.amount_kz ?? 0))}</span>{String(item.status) === "blocked" ? <Button size="sm" variant="outline" onClick={() => setDestinationDraft({ employmentId: String(item.employment_id), beneficiaryName: String(item.beneficiary_name), method: "transfer", bankName: "", iban: "", accountNumber: "", destinationReference: "" })}>Configurar destino</Button> : null}</div></div>)}</div>
              </Panel>

              {destinationDraft ? <Panel title={`Destino de ${destinationDraft.beneficiaryName}`} description="O IBAN é guardado no domínio RH com RLS restrita; a listagem administrativa apresenta apenas os últimos quatro caracteres.">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm"><span>Método</span><select aria-label="Método do destino salarial" className="h-10 w-full rounded-md border bg-background px-3" value={destinationDraft.method} onChange={(event) => setDestinationDraft({ ...destinationDraft, method: event.target.value as DestinationDraft["method"] })}><option value="transfer">Transferência</option><option value="cash">Numerário</option><option value="other">Outro</option></select></label>
                  <label className="space-y-1 text-sm"><span>Banco</span><Input aria-label="Banco do beneficiário" value={destinationDraft.bankName} onChange={(event) => setDestinationDraft({ ...destinationDraft, bankName: event.target.value })} /></label>
                  <label className="space-y-1 text-sm"><span>IBAN</span><Input aria-label="IBAN do beneficiário" value={destinationDraft.iban} onChange={(event) => setDestinationDraft({ ...destinationDraft, iban: event.target.value })} autoComplete="off" /></label>
                  <label className="space-y-1 text-sm"><span>Número de conta</span><Input aria-label="Número de conta do beneficiário" value={destinationDraft.accountNumber} onChange={(event) => setDestinationDraft({ ...destinationDraft, accountNumber: event.target.value })} autoComplete="off" /></label>
                  <label className="space-y-1 text-sm md:col-span-2"><span>Referência alternativa</span><Input aria-label="Referência alternativa do destino" value={destinationDraft.destinationReference} onChange={(event) => setDestinationDraft({ ...destinationDraft, destinationReference: event.target.value })} /></label>
                </div>
                <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setDestinationDraft(null)}>Cancelar</Button><Button onClick={() => saveDestination.mutate(destinationDraft)} disabled={saveDestination.isPending}>{saveDestination.isPending ? "A guardar…" : "Guardar destino"}</Button></div>
              </Panel> : null}

              {String(selected.status) === "authorized" ? <Panel title="Pronto para execução financeira" description="Nenhuma transferência foi executada por esta tela."><div className="flex items-start gap-2 text-sm text-muted-foreground"><CheckCheck className="mt-0.5 size-4" aria-hidden="true" /><p>A próxima fase deverá gerar ficheiro/API bancária ou confirmação manual, registrar resultado item a item e só então criar a saída efectiva no caixa.</p></div></Panel> : null}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
