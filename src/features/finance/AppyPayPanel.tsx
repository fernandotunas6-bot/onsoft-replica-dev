import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createInvoiceCharge,
  getAppyPayStatus,
  listGatewayCharges,
  reconcileOpenCharges,
} from "@/features/finance/appypay.functions";
import { cn } from "@/lib/utils";

const chargesKey = ["tesouraria", "appypay-charges"] as const;
const statusLabel: Record<string, string> = {
  pending: "A aguardar pagamento",
  settling: "A lançar",
  paid: "Pago e conciliado",
  failed: "Falhou",
  expired: "Expirou",
  needs_review: "Rever",
  mismatch: "Não confere",
};
const kz = (n: number) =>
  `${new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(Math.round(n || 0))} Kz`;

export function useAppyPayStatus() {
  const fn = useServerFn(getAppyPayStatus);
  return useQuery({
    queryKey: ["tesouraria", "appypay-status"],
    queryFn: () => fn(),
    retry: false,
  });
}

export function ChargeInvoiceButton(props: {
  invoiceId: string;
  studentName: string;
  balance: number;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createInvoiceCharge);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const m = useMutation({
    mutationFn: (method: "GPO" | "REF") =>
      create({
        data: {
          invoiceId: props.invoiceId,
          studentName: props.studentName,
          amount: props.balance,
          method,
          phoneNumber: method === "GPO" ? phone.replace(/\D/g, "") : undefined,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chargesKey }),
  });
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cobrar
      </Button>
    );
  return (
    <div className="grid gap-1.5 text-left">
      <div className="flex gap-1.5">
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate("REF")}>
          Referência
        </Button>
        <Input
          aria-label="Telemóvel Multicaixa Express"
          className="h-8 w-28"
          placeholder="9XXXXXXXX"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={m.isPending || phone.length < 9}
          onClick={() => m.mutate("GPO")}
        >
          Express
        </Button>
      </div>
      {m.data ? (
        <p className="text-xs text-foreground">
          {m.data.referenceNumber
            ? `Entidade ${m.data.referenceEntity ?? "—"} · Referência ${m.data.referenceNumber}`
            : m.data.message}
        </p>
      ) : null}
      {m.error ? <p className="text-xs text-destructive">{m.error.message}</p> : null}
    </div>
  );
}

export function AppyPayPanel() {
  const qc = useQueryClient();
  const status = useAppyPayStatus();
  const list = useServerFn(listGatewayCharges);
  const reconcile = useServerFn(reconcileOpenCharges);
  const charges = useQuery({ queryKey: chargesKey, queryFn: () => list(), retry: false });
  const rec = useMutation({
    mutationFn: () => reconcile(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chargesKey });
      qc.invalidateQueries({ queryKey: ["tesouraria"] });
    },
  });
  const cfg = status.data;
  return (
    <Panel
      title="Pagamentos AppyPay"
      description={
        cfg?.configured
          ? `Ligado (${cfg.environment}). Referências e Multicaixa Express são confirmados automaticamente e lançados na factura do aluno.`
          : "A AppyPay ainda não está ligada: faltam as chaves da escola."
      }
      action={
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={rec.isPending || !cfg?.configured}
          onClick={() => rec.mutate()}
        >
          <RefreshCw className={cn("size-4", rec.isPending && "animate-spin")} /> Conciliar agora
        </Button>
      }
    >
      {rec.data ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {rec.data.checked} cobranças verificadas · {rec.data.paid} pagas e lançadas.
        </p>
      ) : null}
      {charges.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : charges.error ? (
        <p className="text-sm text-destructive">{(charges.error as Error).message}</p>
      ) : !charges.data?.length ? (
        <EmptyState
          title="Sem cobranças"
          description="Use “Cobrar” numa factura pendente para criar uma referência."
        />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {charges.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate">
                  {c.student_name ?? "Aluno"} ·{" "}
                  {c.method === "GPO" ? "Multicaixa Express" : "Referência"}
                  {c.reference_number ? ` ${c.reference_entity ?? ""}/${c.reference_number}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString("pt-AO")} · {c.merchant_transaction_id}
                  {c.receipt_number ? ` · recibo ${c.receipt_number}` : ""}
                  {c.status_message && c.status !== "paid" ? ` · ${c.status_message}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{kz(c.amount)}</p>
                <p
                  className={cn(
                    "text-xs",
                    c.status === "paid"
                      ? "text-primary"
                      : ["failed", "mismatch", "needs_review"].includes(c.status)
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {statusLabel[c.status] ?? c.status}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
