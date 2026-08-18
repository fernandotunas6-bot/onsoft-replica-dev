import { useState } from "react";
import { Copy, Check, CreditCard, Smartphone, Zap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import {
  generateMulticaixaReference,
  generateMobileWalletOptions,
  type MulticaixaReference,
} from "../emiss-multicaixa";
import { simulateEmisPaymentNotification } from "../server";
import { toast } from "sonner";

interface PaymentReferenceCardProps {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  onPaymentSuccess?: () => void;
}

export function PaymentReferenceCard({
  invoiceId,
  invoiceNumber,
  amount,
  onPaymentSuccess,
}: PaymentReferenceCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const referenceData: MulticaixaReference = generateMulticaixaReference(
    "99824",
    invoiceId,
    amount,
  );
  const wallets = generateMobileWalletOptions(amount, invoiceNumber);

  const copyToClipboard = (text: string, fieldName: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copiado com sucesso!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSimulateWebhook = async () => {
    setIsSimulating(true);
    try {
      const res = await simulateEmisPaymentNotification({
        data: {
          invoiceId,
          amount,
          reference: referenceData.reference,
          method: "multicaixa_express",
        },
      });
      toast.success("Pagamento EMIS Recebido!", {
        description: res.message,
      });
      onPaymentSuccess?.();
    } catch (err) {
      toast.error("Erro na simulação EMIS Webhook", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setIsSimulating(false);
    }
  };

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
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Entidade (EMIS/RUPE)
          </span>
          <div className="flex items-center justify-between font-mono font-bold text-base bg-card px-3 py-1.5 rounded-lg border border-border">
            <span>{referenceData.entity}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(referenceData.entity, "Entidade")}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {copiedField === "Entidade" ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Referência
          </span>
          <div className="flex items-center justify-between font-mono font-bold text-base bg-card px-3 py-1.5 rounded-lg border border-border">
            <span>{referenceData.reference}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(referenceData.reference.replace(/\s+/g, ""), "Referência")}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {copiedField === "Referência" ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Montante Total
          </span>
          <div className="flex items-center justify-between font-mono font-extrabold text-base bg-card px-3 py-1.5 rounded-lg border border-border text-primary">
            <span>{referenceData.amountFormatted}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(String(referenceData.amountNumber), "Montante")}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {copiedField === "Montante" ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* CARTEIRAS MÓVEIS (UNITEL MONEY / KWIK) */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
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
              <p className="text-[10px] font-mono text-muted-foreground truncate">
                Ref: {wallet.transactionRef}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* SIMULADOR DE CONFIRMAÇÃO DE WEBHOOK (TEMPO REAL) */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Conexão direta com Webhook EMIS Ativa (Confirmação Automática de Recibo AGT)
        </div>

        <Button
          type="button"
          size="sm"
          disabled={isSimulating}
          onClick={handleSimulateWebhook}
          className="gap-2 shadow-sm"
        >
          <Zap className="size-3.5" />
          {isSimulating ? "A Confirmar Webhook..." : "Simular Liquidação Instantânea EMIS"}
        </Button>
      </div>
    </div>
  );
}
