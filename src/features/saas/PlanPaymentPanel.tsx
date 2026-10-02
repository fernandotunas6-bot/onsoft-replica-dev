import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  startPlanPayment,
  submitPlanPaymentProof,
  type PlanPaymentStart,
  type SubscriptionOverview,
} from "./subscription-server";
import { planPriceKz } from "./subscription-view";

const PAYMENT_IBAN = String(import.meta.env["VITE_PAYMENT_IBAN"] ?? "").trim();
const PAYMENT_BANK = String(import.meta.env["VITE_PAYMENT_BANK"] ?? "").trim();
const PAYMENT_ACCOUNT_NAME = String(import.meta.env["VITE_PAYMENT_ACCOUNT_NAME"] ?? "").trim();
const SUPPORT_WHATSAPP = String(import.meta.env["VITE_SUPPORT_WHATSAPP"] ?? "").replace(/\D/g, "");

const kz = (value: number) =>
  new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(value);

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Pagar o plano: (1) gerar a cobrança com referência própria no PayFlow — ou,
 * sem PayFlow, o IBAN da plataforma — e (2) enviar o recibo de uma transferência
 * já feita. A equipa confirma a entrada do dinheiro e activa o plano.
 */
export function PlanPaymentPanel({ data }: { data: SubscriptionOverview }) {
  const defaultPlan =
    data.pendingPlanRequest?.planCode ?? data.plan?.code ?? data.plans[0]?.code ?? "";
  const [planCode, setPlanCode] = useState(defaultPlan);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [charge, setCharge] = useState<PlanPaymentStart | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [proofSent, setProofSent] = useState(false);
  const start = useServerFn(startPlanPayment);
  const submitProof = useServerFn(submitPlanPaymentProof);

  const plan = data.plans.find((p) => p.code === planCode) ?? null;
  const amount = plan ? planPriceKz(plan, billing) : 0;

  const startMutation = useMutation({
    mutationFn: () => start({ data: { planCode: planCode as never, billing } }),
    onSuccess: (result) => setCharge(result),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a cobrança."),
  });

  const proofMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Escolha o ficheiro do comprovativo.");
      if (file.size > 5 * 1024 * 1024) throw new Error("O comprovativo deve ter no máximo 5 MB.");
      return submitProof({
        data: {
          planCode: planCode as never,
          billing,
          contentType: file.type as never,
          base64: await fileToBase64(file),
          transferReference:
            reference || (charge?.mode === "payflow" ? (charge.reference ?? undefined) : undefined),
          paidOn: paidOn || undefined,
        },
      });
    },
    onSuccess: () => {
      setProofSent(true);
      setFile(null);
      toast.success("Comprovativo enviado", {
        description:
          "A equipa confirma a entrada do pagamento e activa o plano. Recebe aviso por e-mail.",
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível enviar o comprovativo.",
      ),
  });

  return (
    <Panel title="Pagamento">
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-plan">Plano</Label>
            <select
              id="pay-plan"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={planCode}
              onChange={(e) => {
                setPlanCode(e.target.value);
                setCharge(null);
              }}
            >
              {data.plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-billing">Periodicidade</Label>
            <select
              id="pay-billing"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={billing}
              onChange={(e) => {
                setBilling(e.target.value as "monthly" | "yearly");
                setCharge(null);
              }}
            >
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
        </div>
        <p className="text-sm">
          A pagar: <strong>{amount ? kz(amount) : "sem preço definido"}</strong>
        </p>

        {!charge ? (
          <Button
            type="button"
            size="sm"
            onClick={() => startMutation.mutate()}
            disabled={!amount || startMutation.isPending}
          >
            {startMutation.isPending ? "A gerar…" : "Gerar referência de pagamento"}
          </Button>
        ) : charge.mode === "payflow" ? (
          <dl className="grid gap-1 rounded-md bg-muted/60 p-3 text-sm">
            <dt className="text-xs text-muted-foreground">Transferência bancária</dt>
            {charge.reference ? (
              <dd>
                Referência: <span className="font-mono">{charge.reference}</span>
              </dd>
            ) : null}
            {charge.iban ? <dd className="break-all font-mono text-xs">{charge.iban}</dd> : null}
            {charge.beneficiary ? (
              <dd className="text-xs text-muted-foreground">
                {charge.beneficiary}
                {charge.bankName ? ` · ${charge.bankName}` : ""}
              </dd>
            ) : null}
            <dd className="text-xs text-muted-foreground">
              Indique a referência no descritivo da transferência para a confirmação ser automática.
            </dd>
            <dd className="mt-2">
              <Button asChild size="sm" variant="outline">
                <a href={charge.checkoutUrl} target="_blank" rel="noreferrer">
                  Abrir página de pagamento <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </dd>
          </dl>
        ) : (
          <dl className="grid gap-1 rounded-md bg-muted/60 p-3 text-sm">
            <dt className="text-xs text-muted-foreground">
              Transferência para o IBAN da plataforma
            </dt>
            {PAYMENT_IBAN ? (
              <>
                <dd className="break-all font-mono text-xs">{PAYMENT_IBAN}</dd>
                {PAYMENT_ACCOUNT_NAME || PAYMENT_BANK ? (
                  <dd className="text-xs text-muted-foreground">
                    {[PAYMENT_ACCOUNT_NAME, PAYMENT_BANK].filter(Boolean).join(" · ")}
                  </dd>
                ) : null}
              </>
            ) : (
              <dd className="text-xs text-muted-foreground">
                Os dados bancários são enviados pela equipa comercial.
              </dd>
            )}
            <dd className="text-xs text-muted-foreground">
              No descritivo indique <span className="text-foreground">{data.subdomain}</span>.
            </dd>
          </dl>
        )}
        <p className="text-xs text-muted-foreground">
          Referência Multicaixa: fica disponível quando a integração EMIS da plataforma estiver
          homologada. Até lá, o pagamento é por transferência.
        </p>

        <div className="grid gap-2 border-t pt-3">
          <p className="text-sm font-medium">Já pagou? Envie o recibo</p>
          {proofSent ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" /> Recebido. A equipa valida e activa o
              plano.
            </p>
          ) : (
            <>
              <Input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                aria-label="Comprovativo (PDF ou imagem)"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Referência da transferência (opcional)"
                  aria-label="Referência da transferência (opcional)"
                  value={reference}
                  maxLength={80}
                  onChange={(e) => setReference(e.target.value)}
                />
                <Input
                  type="date"
                  aria-label="Data do pagamento"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => proofMutation.mutate()}
                disabled={!file || proofMutation.isPending}
              >
                <Upload className="size-4" />{" "}
                {proofMutation.isPending ? "A enviar…" : "Enviar comprovativo"}
              </Button>
            </>
          )}
          {SUPPORT_WHATSAPP ? (
            <a
              className="text-xs text-muted-foreground underline underline-offset-4"
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Olá, sou da escola ${data.schoolName} (${data.subdomain}). Tenho uma dúvida sobre o pagamento do plano.`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Dúvidas? Fale connosco por WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
