"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  CreditCard,
  FileCheck2,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { PayflowBrandLockup } from "@/components/payflow/brand-mark";
import { formatCurrency } from "@/lib/formatters";

type CheckoutPayment = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string;
  sourceApp: string;
  status: string;
  paymentMethod: string;
  provider: string;
  createdAt: string;
  canConfirm: boolean;
  bankTransfer: {
    reference: string;
    status: string;
    beneficiary: string;
    bank_name: string;
    iban: string;
    amount: number;
    currency: string;
    expires_at: string;
    verified_at: string | null;
  } | null;
  receipt: {
    code: string;
    issuedAt: string;
    verificationUrl: string;
  } | null;
};

const methods = [
  {
    id: "mobile_wallet",
    label: "Carteira móvel",
    detail: "Confirmação pelo telemóvel",
    icon: Smartphone,
  },
  {
    id: "card",
    label: "Cartão",
    detail: "Débito ou crédito",
    icon: CreditCard,
  },
  {
    id: "bank_transfer",
    label: "Transferência bancária",
    detail: "Referência gerada no momento",
    icon: Landmark,
  },
] as const;

function LoadingCheckout() {
  return (
    <Card className="w-full max-w-lg border-slate-200 shadow-2xl shadow-blue-950/10">
      <CardContent className="space-y-5 px-6 py-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-12 w-52" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

export function CheckoutExperience({ token }: { token: string }) {
  const [payment, setPayment] = useState<CheckoutPayment | null>(null);
  const [method, setMethod] = useState<(typeof methods)[number]["id"]>("mobile_wallet");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const loadPayment = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/v1/checkout/${token}`, { cache: "no-store" });
      const body = (await response.json()) as { data?: CheckoutPayment; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Não foi possível abrir o pagamento.");
      setPayment(body.data);
      setSuccess(body.data.status === "paid");
      setProofSubmitted(body.data.bankTransfer?.status === "proof_submitted");
    } catch (reason) {
      if (!silent) setError(reason instanceof Error ? reason.message : "Não foi possível abrir o pagamento.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/checkout/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: CheckoutPayment;
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Não foi possível abrir o pagamento.");
        }
        if (active) {
          setPayment(body.data);
          setSuccess(body.data.status === "paid");
          setProofSubmitted(body.data.bankTransfer?.status === "proof_submitted");
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Não foi possível abrir o pagamento.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (payment?.provider !== "bank_transfer" || payment.status !== "pending") return;
    const timer = window.setInterval(() => void loadPayment(true), 12_000);
    return () => window.clearInterval(timer);
  }, [loadPayment, payment?.provider, payment?.status]);

  async function confirmPayment() {
    setProcessing(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/checkout/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const body = (await response.json()) as { data?: { status: string }; error?: { message?: string } };
      if (!response.ok || body.data?.status !== "paid") {
        throw new Error(body.error?.message ?? "Não foi possível confirmar o pagamento.");
      }
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível confirmar o pagamento.");
    } finally {
      setProcessing(false);
    }
  }

  async function uploadProof() {
    if (!proof) {
      setError("Selecione um comprovativo em PDF, JPG, PNG ou WebP.");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      const form = new FormData();
      form.set("proof", proof);
      const response = await fetch(`/api/v1/checkout/${token}/proof`, { method: "POST", body: form });
      const body = (await response.json()) as { data?: { status: string }; error?: { message?: string } };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Não foi possível enviar o comprovativo.");
      }
      setProofSubmitted(true);
      setProof(null);
      await loadPayment(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar o comprovativo.");
    } finally {
      setProcessing(false);
    }
  }

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <main className="payflow-grid relative min-h-screen overflow-hidden bg-[#f3f7fb] px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="pointer-events-none absolute left-[-8rem] top-[-8rem] size-96 rounded-full bg-blue-200/50 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-8rem] size-96 rounded-full bg-emerald-200/45 blur-3xl" />
      <div className="relative mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="flex items-center gap-3">
          <PayflowBrandLockup subtitle="Checkout seguro" size="sm" />
        </div>
        {payment?.canConfirm && (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
            <span className="size-1.5 rounded-full bg-amber-500" /> Ambiente local
          </Badge>
        )}
      </div>

      <div className="relative mx-auto mt-9 grid w-full max-w-5xl gap-7 lg:grid-cols-[minmax(0,.78fr)_minmax(25rem,1fr)] lg:items-start">
        <section className="order-2 lg:order-1 lg:pt-7">
          <Button variant="ghost" className="-ml-3 mb-5 rounded-xl text-slate-500" onClick={() => history.back()}><ArrowLeft className="size-4" /> Voltar</Button>
          <p className="text-sm font-semibold text-blue-600">Pagamento solicitado</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            {payment?.canConfirm ? "Valide o fluxo local." : "Acompanhe o seu pagamento."}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">
            {payment?.canConfirm
              ? "Este modo é exclusivo para desenvolvimento local e não movimenta valores reais."
              : "A confirmação é feita pelo provedor e refletida aqui somente depois de validada pelo backend."}
          </p>
          <div className="mt-7 space-y-4">
            <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="size-4" /></span><div><p className="text-sm font-semibold">Pagamento protegido</p><p className="mt-0.5 text-xs leading-5 text-slate-500">Dados isolados e comunicação cifrada.</p></div></div>
            <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><RefreshCw className="size-4" /></span><div><p className="text-sm font-semibold">Estado sincronizado</p><p className="mt-0.5 text-xs leading-5 text-slate-500">A aplicação de origem recebe a atualização.</p></div></div>
          </div>
        </section>

        <section className="order-1 lg:order-2" aria-live="polite">
          {loading ? (
            <LoadingCheckout />
          ) : error && !payment ? (
            <Card className="border-rose-200 shadow-2xl shadow-blue-950/10">
              <CardContent className="px-6 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><LockKeyhole className="size-5" /></div>
                <h2 className="mt-4 text-lg font-bold">Link indisponível</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
              </CardContent>
            </Card>
          ) : success && payment ? (
            <Card className="overflow-hidden border-emerald-200 shadow-2xl shadow-emerald-950/10">
              <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-blue-500" />
              <CardContent className="px-7 py-4 text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60"><CheckCircle2 className="size-8" /></div>
                <p className="mt-6 text-sm font-semibold text-emerald-700">Pagamento confirmado</p>
                <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em]">{formatCurrency(payment.amount, payment.currency)}</h2>
                <p className="mt-2 text-sm text-slate-500">{payment.description}</p>
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
                  <div className="flex items-center justify-between gap-4 text-sm"><span className="text-slate-500">Referência</span><code className="font-semibold text-slate-800">{payment.bankTransfer?.reference ?? payment.id}</code></div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-sm"><span className="text-slate-500">Aplicação</span><span className="font-semibold text-slate-800">{payment.sourceApp}</span></div>
                </div>
                {payment.receipt && (
                  <Button asChild className="mt-6 h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700">
                    <a href={payment.receipt.verificationUrl}>Ver recibo validado</a>
                  </Button>
                )}
                <Button variant="outline" className="mt-3 h-11 w-full rounded-xl" onClick={() => history.back()}>Concluir</Button>
              </CardContent>
            </Card>
          ) : payment ? (
            <Card className="overflow-hidden border-slate-200 py-0 shadow-2xl shadow-blue-950/10">
              <div className="h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400" />
              <CardContent className="px-6 py-7 sm:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Total a pagar</p><p className="mt-2 text-3xl font-bold tracking-[-0.04em]">{formatCurrency(payment.amount, payment.currency)}</p></div>
                  <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{payment.currency}</span>
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-semibold text-slate-900">{payment.description}</p><p className="mt-1 text-xs text-slate-500">{payment.sourceApp} · {payment.customerName || "Cliente"}</p></div>

                {payment.canConfirm ? (
                  <>
                    <div className="mt-6">
                      <p className="mb-3 text-sm font-semibold text-slate-900">Método de teste local</p>
                      <RadioGroup value={method} onValueChange={(value) => setMethod(value as typeof method)}>
                        {methods.map((item) => (
                          <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${method === item.id ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/10" : "border-slate-200 hover:border-slate-300"}`}>
                            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${method === item.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><item.icon className="size-5" /></span>
                            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span></span>
                            <RadioGroupItem value={item.id} aria-label={item.label} />
                          </label>
                        ))}
                      </RadioGroup>
                    </div>
                    {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                    <Button disabled={processing} onClick={confirmPayment} className="mt-6 h-12 w-full rounded-xl bg-blue-600 text-base shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                      {processing ? <><LoaderCircle className="size-4 animate-spin" /> A confirmar...</> : <><LockKeyhole className="size-4" /> Confirmar localmente</>}
                    </Button>
                    <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400"><LockKeyhole className="size-3" /> Ferramenta de desenvolvimento · Sem valor real</p>
                  </>
                ) : payment.bankTransfer ? (
                  <div className="mt-6 space-y-5">
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700"><Landmark className="size-5" /></span>
                        <div>
                          <p className="text-sm font-semibold text-blue-950">Transferência bancária</p>
                          <p className="mt-1 text-xs leading-5 text-blue-800">Transfira o valor exato e inclua a referência única na descrição da operação.</p>
                        </div>
                      </div>
                      <dl className="mt-5 space-y-3 border-t border-blue-200 pt-4 text-sm">
                        <div className="flex justify-between gap-4"><dt className="text-blue-700">Beneficiário</dt><dd className="text-right font-semibold text-blue-950">{payment.bankTransfer.beneficiary}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-blue-700">Banco</dt><dd className="text-right font-semibold text-blue-950">{payment.bankTransfer.bank_name}</dd></div>
                        <div className="flex items-center justify-between gap-4"><dt className="text-blue-700">IBAN</dt><dd className="flex items-center gap-2 text-right"><code className="font-semibold text-blue-950">{payment.bankTransfer.iban}</code><button type="button" onClick={() => void copyValue(payment.bankTransfer!.iban)} aria-label="Copiar IBAN"><Copy className="size-4" /></button></dd></div>
                        <div className="flex items-center justify-between gap-4"><dt className="text-blue-700">Referência</dt><dd className="flex items-center gap-2 text-right"><code className="font-semibold text-blue-950">{payment.bankTransfer.reference}</code><button type="button" onClick={() => void copyValue(payment.bankTransfer!.reference)} aria-label="Copiar referência"><Copy className="size-4" /></button></dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-blue-700">Validade</dt><dd className="text-right font-semibold text-blue-950">{new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(payment.bankTransfer.expires_at))}</dd></div>
                      </dl>
                    </div>

                    {proofSubmitted ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                        <div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 size-5 shrink-0" /><div><p className="text-sm font-semibold">Comprovativo recebido</p><p className="mt-1 text-xs leading-5 text-amber-800">O pagamento continua pendente enquanto confirmamos a entrada no extrato bancário.</p></div></div>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="transfer-proof" className="text-sm font-semibold text-slate-900">Enviar comprovativo</label>
                        <input
                          id="transfer-proof"
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                          className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold"
                        />
                        <Button disabled={processing || !proof} onClick={uploadProof} className="mt-3 h-11 w-full rounded-xl bg-blue-600 hover:bg-blue-700">
                          {processing ? <><LoaderCircle className="size-4 animate-spin" /> A enviar...</> : <><Upload className="size-4" /> Enviar comprovativo</>}
                        </Button>
                      </div>
                    )}
                    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                    <p className="text-center text-xs leading-5 text-slate-500">O comprovativo não confirma o pagamento. O recibo final será emitido somente após validação do movimento bancário.</p>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-amber-700">
                        <RefreshCw className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Pagamento em confirmação</p>
                        <p className="mt-1 text-xs leading-5 text-amber-800">
                          Nenhum valor será apresentado como pago antes da confirmação do provedor.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </main>
  );
}
