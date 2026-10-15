import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, CreditCard, Smartphone, Zap, ShieldCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { getFinanceGatewayConfirmUrl } from "@/lib/ecosystem-urls";
import { confirmManualMulticaixaPayment, generateInvoicePaymentReference } from "../server";
import { toast } from "sonner";

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
export function PaymentReferenceCard({
  invoiceId,
  invoiceNumber,
  onPaymentSuccess,
}: PaymentReferenceCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const refQuery = useQuery({
    queryKey: ["finance", "payment-reference", invoiceId],
    queryFn: () => generateInvoicePaymentReference({ data: { invoiceId } }),
    retry: false,
  });

  const referenceData = refQuery.data?.multicaixa;
  const lateFee = refQuery.data?.lateFee ?? 0;
  const wallets = refQuery.data?.mobileWallets ?? [];

  const copyToClipboard = (text: string, fieldName: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copiado com sucesso!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleConfirmManualPayment = async () => {
    if (!referenceData) return;
    if (
      !window.confirm(
        `Confirma que viu o comprovativo deste pagamento (${referenceData.amountFormatted}, referência ${referenceData.reference})? Esta acção marca a fatura como paga.`,
      )
    ) {
      return;
    }
    setIsConfirming(true);
    try {
      const res = await confirmManualMulticaixaPayment({
        data: {
          invoiceId,
          amount: referenceData.amountNumber,
          reference: referenceData.reference,
          method: "multicaixa_express",
        },
      });
      toast.success("Pagamento confirmado", {
        description: res.message,
      });
      onPaymentSuccess?.();
    } catch (err) {
      toast.error("Erro ao confirmar pagamento", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  if (refQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (refQuery.isError || !referenceData) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        {refQuery.error instanceof Error
          ? refQuery.error.message
          : "Não foi possível gerar a referência EMIS."}
      </p>
    );
  }

  return (
    <div className="surface-card p-6 space-y-6 rounded-2xl border border-border shadow-sm">
      {/* CABEÇALHO DO TALÃO MULTICAIXA */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <IconChip icon={CreditCard} tone="warning" size="md" />
          <div>
            <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
              Pagamento Multicaixa / Express / EMIS
            </h3>
            <p className="text-xs text-muted-foreground">
              Fatura {invoiceNumber} · Válido até {referenceData.expiresAt}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-warning/10 text-warning border border-warning/20">
          Aguardando Liquidação
        </span>
      </div>

      {/* DADOS DE REFERÊNCIA MULTICAIXA */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-border bg-secondary/20">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Entidade (EMIS/RUPE)</span>
          <div className="flex items-center justify-between font-mono font-bold text-base bg-card px-3 py-1.5 rounded-lg border border-border">
            <span>{referenceData.entity}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(referenceData.entity, "Entidade")}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {copiedField === "Entidade" ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Referência</span>
          <div className="flex items-center justify-between font-mono font-bold text-base bg-card px-3 py-1.5 rounded-lg border border-border">
            <span>{referenceData.reference}</span>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(referenceData.reference.replace(/\s+/g, ""), "Referência")
              }
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {copiedField === "Referência" ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Montante Total</span>
          <div className="flex items-center justify-between font-mono font-extrabold text-base bg-card px-3 py-1.5 rounded-lg border border-border text-primary">
            <span>{referenceData.amountFormatted}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(String(referenceData.amountNumber), "Montante")}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {copiedField === "Montante" ? (
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
          <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <Smartphone className="size-3.5 text-primary" />
            Carteiras Móveis e Pagamento Instantâneo
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {wallets.map((wallet) => (
              <div
                key={wallet.provider}
                className="p-3 rounded-xl border border-border bg-card space-y-1 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">{wallet.providerName}</span>
                  <Zap className="size-3 text-warning" />
                </div>
                <p className="text-[11px] text-muted-foreground">{wallet.phoneOrAccount}</p>
                <p className="text-[11px] font-mono text-muted-foreground truncate">
                  Ref: {wallet.transactionRef}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground font-mono break-all">
        Webhook EMIS: POST {getFinanceGatewayConfirmUrl()}
      </div>

      {/* CONFIRMAÇÃO MANUAL — fallback quando o EMIS ainda não chama o webhook */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Referência estável por fatura. Confirme manualmente ou configure a entidade EMIS e webhook
          em Integrações.
        </div>

        <Button
          type="button"
          size="sm"
          disabled={isConfirming}
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
