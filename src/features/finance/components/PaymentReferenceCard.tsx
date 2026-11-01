import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, CreditCard, Smartphone, Zap, ShieldCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { paidOnDateSchema } from "../schemas";
import { paymentPlanState, receiptState } from "../payment-states";
import { usePaymentAttemptKey } from "../use-payment-attempt-key";
import { confirmManualMulticaixaPayment, generateInvoicePaymentReference } from "../server";
import { toast } from "@/lib/toast";
import { schoolTodayIso } from "@/lib/school-date";

const kwanzaLabel = (value: number) =>
  new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" }).format(value);

interface PaymentReferenceCardProps {
  invoiceId: string;
  invoiceNumber: string;
  onPaymentSuccess?: () => void;
}

/**
 * Referência do que falta pagar. O valor vem do servidor: inclui a multa por atraso
 * que o pagamento electrónico de hoje leva (`late-fee.ts`), que o ecrã não sabe.
 */
export function PaymentReferenceCard(props: PaymentReferenceCardProps) {
  return <InvoicePaymentReferenceCard key={props.invoiceId} {...props} />;
}

function InvoicePaymentReferenceCard({
  invoiceId,
  invoiceNumber,
  onPaymentSuccess,
}: PaymentReferenceCardProps) {
  const paymentKey = usePaymentAttemptKey();
  const queryClient = useQueryClient();
  const confirming = useRef(false);
  const [recorded, setRecorded] = useState<{ message: string; receiptNumber?: string } | null>(
    null,
  );
  const [copiedField, setCopiedField] = useState<{ field: string; text: string } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  // Dia do pagamento no comprovativo: a multa é a desse dia, não a do dia da confirmação.
  const today = schoolTodayIso();
  const [paidOn, setPaidOn] = useState(today);
  const paidOnValid = paidOnDateSchema.safeParse(paidOn).success;
  const paidOnForQuery = paidOnValid ? paidOn : today;

  const refQuery = useQuery({
    queryKey: ["finance", "payment-reference", invoiceId, paidOnForQuery],
    queryFn: () =>
      generateInvoicePaymentReference({
        data: { invoiceId, paidOn: paidOnForQuery },
      }),
    retry: false,
    enabled: paidOnValid,
    // Ao mudar a data, o cartão fica com a referência anterior até chegar a nova.
    placeholderData: (previous) => previous,
  });

  const referenceReady = paidOnValid && !refQuery.isFetching && !refQuery.isPlaceholderData;
  const referenceData = refQuery.data?.multicaixa;
  const lateFee = refQuery.data?.lateFee ?? 0;
  const wallets = refQuery.data?.mobileWallets ?? [];

  const copyToClipboard = async (text: string, fieldName: string) => {
    if (!referenceReady || confirming.current || recorded) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField({ field: fieldName, text });
      toast.success(`${fieldName} copiado com sucesso!`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Não foi possível copiar. Seleccione o texto e copie manualmente.");
    }
  };

  const handleConfirmManualPayment = async () => {
    if (!referenceData || !referenceReady || confirming.current || recorded) return;
    if (
      !window.confirm(
        `Confirma que viu o comprovativo deste pagamento (${referenceData.amountFormatted}, referência ${referenceData.reference}, pago a ${paidOnForQuery})? Esta acção regista o valor e actualiza o saldo da factura.`,
      )
    ) {
      return;
    }
    confirming.current = true;
    setIsConfirming(true);
    const attempt = [
      invoiceId,
      referenceData.amountNumber,
      referenceData.reference,
      paidOnForQuery,
      "multicaixa_express",
    ].join("|");
    let succeeded = false;
    try {
      const res = await confirmManualMulticaixaPayment({
        data: {
          invoiceId,
          amount: referenceData.amountNumber,
          reference: referenceData.reference,
          method: "multicaixa_express",
          idempotencyKey: paymentKey.keyFor(attempt),
          paidOn: paidOnForQuery,
        },
      });
      paymentKey.settled(attempt);
      setRecorded({ message: res.message, receiptNumber: res.receiptNumber });
      succeeded = true;
      toast.success("Pagamento confirmado", {
        description: res.message,
      });
    } catch (err) {
      toast.error("Erro ao confirmar pagamento", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      confirming.current = false;
      setIsConfirming(false);
    }
    if (succeeded) {
      // Falhar a actualização do ecrã não transforma um recibo aceite em falha
      // de pagamento, nem permite voltar a confirmar o mesmo cartão.
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["finance"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["arquivos"] }),
      ]);
      onPaymentSuccess?.();
    }
  };

  if (recorded) {
    const state = receiptState("issued");
    return (
      <div role="status" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <StatusBadge status={state.status} label={state.label} />
        <p className="text-sm font-medium">Pagamento registado</p>
        {recorded.receiptNumber ? <p className="text-sm">Recibo {recorded.receiptNumber}</p> : null}
        <p className="text-sm text-muted-foreground">{recorded.message}</p>
      </div>
    );
  }

  if (refQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (refQuery.isError || !referenceData) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-sm text-destructive">
          {refQuery.error instanceof Error
            ? refQuery.error.message
            : "Não foi possível gerar a referência EMIS."}
        </p>
        <Button
          variant="outline"
          disabled={refQuery.isFetching || !paidOnValid}
          onClick={() => void refQuery.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-card p-4 sm:p-6 space-y-6 rounded-2xl border border-border shadow-sm">
      {/* CABEÇALHO DO TALÃO MULTICAIXA */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-border">
        <div className="flex min-w-0 items-start gap-3">
          <IconChip icon={CreditCard} tone="warning" size="md" />
          <div className="min-w-0">
            <h3 className="font-semibold text-base text-foreground [overflow-wrap:anywhere]">
              Pagamento Multicaixa / Express / EMIS
            </h3>
            <p className="text-xs text-muted-foreground">
              Fatura {invoiceNumber} · Válido até {referenceData.expiresAt}
            </p>
          </div>
        </div>
        <StatusBadge
          status={paymentPlanState("pending_gateway").status}
          label={paymentPlanState("pending_gateway").label}
        />
      </div>

      {/* DADOS DE REFERÊNCIA MULTICAIXA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl border border-border bg-secondary/20">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Entidade EMIS</span>
          <div className="flex min-w-0 items-center justify-between gap-2 tabular-nums font-semibold text-base bg-card px-3 py-1.5 rounded-lg border border-border">
            <span className="min-w-0 [overflow-wrap:anywhere]">{referenceData.entity}</span>
            <button
              type="button"
              aria-label="Copiar entidade"
              disabled={!referenceReady || isConfirming}
              onClick={() => void copyToClipboard(referenceData.entity, "Entidade")}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copiedField?.field === "Entidade" && copiedField.text === referenceData.entity ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Referência</span>
          <div className="flex min-w-0 items-center justify-between gap-2 tabular-nums font-semibold text-base bg-card px-3 py-1.5 rounded-lg border border-border">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {referenceReady
                ? referenceData.reference
                : paidOnValid
                  ? "A actualizar…"
                  : "Seleccione uma data"}
            </span>
            <button
              type="button"
              aria-label="Copiar referência"
              disabled={!referenceReady || isConfirming}
              onClick={() =>
                void copyToClipboard(referenceData.reference.replace(/\s+/g, ""), "Referência")
              }
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copiedField?.field === "Referência" &&
              copiedField.text === referenceData.reference.replace(/\s+/g, "") ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Montante a pagar</span>
          <div className="flex min-w-0 items-center justify-between gap-2 tabular-nums font-semibold text-base bg-card px-3 py-1.5 rounded-lg border border-border text-primary">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {referenceReady
                ? referenceData.amountFormatted
                : paidOnValid
                  ? "A actualizar…"
                  : "Seleccione uma data"}
            </span>
            <button
              type="button"
              aria-label="Copiar montante"
              disabled={!referenceReady || isConfirming}
              onClick={() => void copyToClipboard(String(referenceData.amountNumber), "Montante")}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copiedField?.field === "Montante" &&
              copiedField.text === String(referenceData.amountNumber) ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
          {lateFee > 0 ? (
            <p className="text-xs text-muted-foreground">
              Inclui a multa por atraso de {kwanzaLabel(lateFee)}.
            </p>
          ) : null}
        </div>
      </div>

      {/* CARTEIRAS MÓVEIS — só as que a escola configurou */}
      {wallets.length ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Smartphone className="size-3.5 text-primary" />
            Carteiras Móveis e Pagamento Instantâneo
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {wallets.map((wallet) => (
              <div
                key={wallet.provider}
                className="p-3 rounded-xl border border-border bg-card space-y-1 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">{wallet.providerName}</span>
                  <Zap className="size-3 text-warning" />
                </div>
                <p className="text-[11px] text-muted-foreground">{wallet.phoneOrAccount}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground truncate">
                  Ref: {wallet.transactionRef}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
        Confirme manualmente apenas depois de verificar o comprovativo. Gerar uma referência não
        confirma o recebimento.
      </div>

      {refQuery.isFetching ? (
        <p role="status" className="text-sm text-muted-foreground">
          A actualizar o valor para a data escolhida…
        </p>
      ) : null}
      {!paidOnValid ? (
        <p role="alert" className="text-sm text-destructive">
          Indique uma data válida até hoje.
        </p>
      ) : null}

      {/* CONFIRMAÇÃO MANUAL — exige comprovativo e recibo confirmado pelo servidor */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Referência estável por fatura. Confirme manualmente ou configure a entidade EMIS e webhook
          em Integrações.
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Pago a
          <input
            type="date"
            value={paidOn}
            max={today}
            onChange={(event) => setPaidOn(event.target.value)}
            disabled={isConfirming}
            className="h-[44px] rounded-md border border-input bg-background px-2 text-base text-foreground md:text-sm"
            aria-label="Data do pagamento no comprovativo"
          />
        </label>

        <Button
          type="button"
          size="sm"
          disabled={isConfirming || !referenceReady}
          onClick={() => void handleConfirmManualPayment()}
          className="gap-2 shadow-sm"
        >
          <Zap className="size-3.5" />
          {isConfirming ? "A confirmar…" : "Confirmar pagamento manualmente"}
        </Button>
      </div>
    </div>
  );
}
