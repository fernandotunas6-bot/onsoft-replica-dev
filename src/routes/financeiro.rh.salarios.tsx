import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { toastActionError } from "@/lib/action-error-toast";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kwanza } from "@/lib/currency";
import { requestHrSalaryChange, reviewHrSalaryChange } from "@/features/hr/salary-changes";
import {
  applyApprovedHrSalaryChange,
  listHrSalaryChangeRequests,
  listHrContractsForSalaryChange,
  listHrSalaryAmendments,
} from "@/features/hr/salary-amendments";
import { listApprovedSalaryScales } from "@/features/hr/salary-catalog";

export const Route = createFileRoute("/financeiro/rh/salarios")({
  head: () => ({ meta: [{ title: "Alterações Salariais · RH · SIGA" }] }),
  component: SalaryOperationsPage,
});
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
function SalaryOperationsPage() {
  const qc = useQueryClient();
  const [contractId, setContractId] = useState("");
  const [stepId, setStepId] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [reason, setReason] = useState("");
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const contracts = useQuery({
    queryKey: ["hr", "salary-contracts"],
    queryFn: () => listHrContractsForSalaryChange(),
    retry: false,
  });
  const requests = useQuery({
    queryKey: ["hr", "salary-requests"],
    queryFn: () => listHrSalaryChangeRequests(),
    retry: false,
  });
  const scales = useQuery({
    queryKey: ["hr", "salary-scales"],
    queryFn: () => listApprovedSalaryScales(),
    retry: false,
  });
  const ledger = useQuery({
    queryKey: ["hr", "salary-amendments"],
    queryFn: () => listHrSalaryAmendments(),
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["hr", "salary-requests"] }),
      qc.invalidateQueries({ queryKey: ["hr", "salary-amendments"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () =>
      requestHrSalaryChange({
        data: {
          contractId,
          requestedStepId: stepId || null,
          proposedBaseSalaryKz: Number(amount),
          effectiveOn,
          reason,
        },
      }),
    onSuccess: async () => {
      toast.success("Pedido salarial registado.");
      setReason("");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível concluir a acção."),
  });
  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
      reviewHrSalaryChange({ data: { requestId: id, decision, reason: reviewReasons[id] ?? "" } }),
    onSuccess: async () => {
      toast.success("Decisão registada.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível concluir a acção."),
  });
  const apply = useMutation({
    mutationFn: (id: string) => applyApprovedHrSalaryChange({ data: { requestId: id } }),
    onSuccess: async () => {
      toast.success("Alteração registada no histórico salarial.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível concluir a acção."),
  });
  const options = (scales.data ?? []).flatMap((scale) =>
    scale.versions.flatMap((version) =>
      version.steps.map((step) => ({
        id: step.id,
        label: `${scale.name} · ${step.category_name} · ${step.grade} · ${kwanza(Number(step.monthly_base_kz))}`,
        amount: Number(step.monthly_base_kz),
      })),
    ),
  );
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="Alterações salariais"
          description="Pedidos, revisão independente e aplicação auditada. O histórico não altera folhas já aprovadas."
          actions={
            <Button asChild variant="outline">
              <Link to="/financeiro/rh/folha">Voltar à folha</Link>
            </Button>
          }
        />
        <Panel
          title="Novo pedido"
          description="Seleccione um contrato activo. Um segundo responsável revê e um terceiro aplica."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Contrato</span>
              <select
                aria-label="Contrato"
                className="h-10 w-full rounded-lg border bg-background px-3"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
              >
                <option value="">Seleccione um contrato</option>
                {(contracts.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_number || c.id} · {kwanza(Number(c.base_salary_kz))}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Escalão aprovado (opcional)</span>
              <select
                aria-label="Escalão salarial"
                className="h-10 w-full rounded-lg border bg-background px-3"
                value={stepId}
                onChange={(e) => {
                  const id = e.target.value;
                  setStepId(id);
                  const found = options.find((s) => s.id === id);
                  if (found) setAmount(String(found.amount));
                }}
              >
                <option value="">Remuneração contratual sem escalão</option>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Novo salário-base (Kz)</span>
              {/* `aria-label` mesmo dentro do `<label>`: a associação implícita é
                  válida, mas o verificador de acessibilidade do projecto não a
                  reconhece — e explicitar não custa nada a quem lê por voz.
                  `inputMode="decimal"` dá o teclado com vírgula no telemóvel. */}
              <Input
                aria-label="Novo salário-base em kwanzas"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={Boolean(stepId)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Entrada em vigor</span>
              <Input
                aria-label="Data de entrada em vigor"
                type="date"
                value={effectiveOn}
                onChange={(e) => setEffectiveOn(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Justificação (mínimo 10 caracteres)</span>
              <textarea
                className="min-h-24 w-full rounded-lg border bg-background p-3"
                maxLength={1500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              disabled={
                create.isPending ||
                !contractId ||
                !effectiveOn ||
                amount.trim() === "" ||
                !Number.isFinite(Number(amount)) ||
                Number(amount) < 0 ||
                reason.trim().length < 10
              }
              onClick={() => create.mutate()}
            >
              {create.isPending ? "A registar…" : "Submeter pedido"}
            </Button>
          </div>
        </Panel>
        <Panel
          title="Pedidos e aprovações"
          description="Cada etapa exige um utilizador diferente. Os pedidos aprovados não modificam directamente contratos históricos."
        >
          {requests.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar pedidos…</p>
          ) : requests.isError ? (
            <p className="text-sm text-destructive">{errorText(requests.error)}</p>
          ) : (requests.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Não existem pedidos nesta escola.</p>
          ) : (
            <div className="space-y-3">
              {(requests.data ?? []).map((r) => (
                <div key={r.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{kwanza(Number(r.proposed_base_salary_kz))}</p>
                      <p className="text-sm text-muted-foreground">
                        Vigência: {r.effective_on} · Estado: {r.status}
                      </p>
                    </div>
                    {r.status === "approved" && (
                      <Button
                        size="sm"
                        disabled={apply.isPending}
                        onClick={() => apply.mutate(r.id)}
                      >
                        Aplicar alteração
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-sm">{r.reason}</p>
                  {r.status === "pending" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Input
                        aria-label="Fundamentação da decisão"
                        placeholder="Fundamentação da decisão (mín. 10 caracteres)"
                        value={reviewReasons[r.id] ?? ""}
                        onChange={(e) =>
                          setReviewReasons((old) => ({ ...old, [r.id]: e.target.value }))
                        }
                      />
                      <Button
                        size="sm"
                        disabled={
                          review.isPending || (reviewReasons[r.id] ?? "").trim().length < 10
                        }
                        onClick={() => review.mutate({ id: r.id, decision: "approved" })}
                      >
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          review.isPending || (reviewReasons[r.id] ?? "").trim().length < 10
                        }
                        onClick={() => review.mutate({ id: r.id, decision: "rejected" })}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  )}
                  {r.review_reason && (
                    <p className="mt-2 text-xs text-muted-foreground">Decisão: {r.review_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel
          title="Histórico salarial auditado"
          description="Registos imutáveis de alterações efectivamente aplicadas."
        >
          {ledger.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar histórico…</p>
          ) : ledger.isError ? (
            <p className="text-sm text-destructive">{errorText(ledger.error)}</p>
          ) : (ledger.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não existem alterações aplicadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-3 pr-4">Contrato</th>
                    <th className="py-3 pr-4">Vigência</th>
                    <th className="py-3 pr-4">Anterior</th>
                    <th className="py-3 pr-4">Novo</th>
                    <th className="py-3">Registado</th>
                  </tr>
                </thead>
                <tbody>
                  {(ledger.data ?? []).map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">
                        {entry.contract_id.slice(0, 8)}
                      </td>
                      <td className="py-3 pr-4">{entry.effective_on}</td>
                      <td className="py-3 pr-4">{kwanza(Number(entry.previous_base_salary_kz))}</td>
                      <td className="py-3 pr-4 font-semibold">
                        {kwanza(Number(entry.new_base_salary_kz))}
                      </td>
                      <td className="py-3">
                        {new Date(entry.created_at).toLocaleDateString("pt-AO")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
