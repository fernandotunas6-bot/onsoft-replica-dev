"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  LockKeyhole,
  Network,
  Printer,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";

type ReceiptRecord = {
  valid: boolean;
  receipt_code: string;
  issued_at: string;
  school: { code: string; name: string } | null;
  student: { code: string; initials: string } | null;
  payer: { label: string; source: string };
  invoice_code: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  provider: string;
  payment_id: string;
  merchant_reference: string | null;
  provider_transaction_id: string | null;
  verified_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-AO", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[12rem_1fr] sm:items-center">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`break-all text-sm font-semibold text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

export function ReceiptVerification({ code }: { code: string }) {
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/receipts/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: ReceiptRecord;
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Comprovativo não encontrado.");
        }
        if (active) setReceipt(body.data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível validar o comprovativo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  return (
    <main className="payflow-grid min-h-screen bg-[#f3f7fb] px-4 py-6 text-slate-950 print:bg-white print:p-0 sm:px-6 sm:py-9">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between print:hidden">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-400 text-white shadow-lg shadow-blue-600/20"><Network className="size-5" /></span>
          <div><p className="font-bold tracking-tight">PayFlow</p><p className="text-xs text-slate-500">Validação de comprovativos</p></div>
        </Link>
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700"><ShieldCheck className="size-3" /> Consulta pública</Badge>
      </div>

      <div className="mx-auto mt-7 w-full max-w-4xl print:mt-0">
        {loading && (
          <Card className="border-slate-200 py-0 shadow-xl shadow-blue-950/10">
            <CardContent className="space-y-5 p-7 sm:p-9"><Skeleton className="mx-auto size-16 rounded-full" /><Skeleton className="mx-auto h-8 w-64" /><Skeleton className="mx-auto h-5 w-44" /><Skeleton className="h-72 w-full rounded-2xl" /></CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card className="border-rose-200 py-0 shadow-xl shadow-blue-950/10">
            <CardContent className="p-7 sm:p-9">
              <Alert variant="destructive" className="border-rose-200 bg-rose-50"><FileCheck2 /><AlertTitle>Comprovativo não validado</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
              <Button asChild variant="outline" className="mt-6 rounded-xl"><a href="/aluno/pagar"><ArrowLeft /> Voltar ao portal do aluno</a></Button>
            </CardContent>
          </Card>
        )}

        {!loading && receipt && (
          <Card className="overflow-hidden border-slate-200 py-0 shadow-2xl shadow-blue-950/10 print:border-0 print:shadow-none">
            <div className={`h-2 ${receipt.valid ? "bg-gradient-to-r from-emerald-600 via-emerald-400 to-cyan-400" : "bg-amber-500"}`} />
            <CardContent className="p-6 sm:p-9">
              <div className="text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60"><CheckCircle2 className="size-8" /></div>
                <Badge className="mt-6 border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline"><ShieldCheck className="size-3" /> Comprovativo autêntico</Badge>
                <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">{formatCurrency(receipt.amount, receipt.currency)}</h1>
                <p className="mt-2 text-sm text-slate-500">{receipt.description}</p>
              </div>

              <Separator className="my-7" />

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><Building2 className="size-5 text-blue-600" /><p className="mt-3 text-xs text-slate-500">{receipt.school ? "Escola" : "Pagador"}</p><p className="mt-1 text-sm font-semibold">{receipt.school?.name ?? receipt.payer.label}</p>{receipt.school?.code && <code className="mt-1 block text-xs text-slate-500">{receipt.school.code}</code>}</div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><UserRound className="size-5 text-blue-600" /><p className="mt-3 text-xs text-slate-500">{receipt.student ? "Aluno protegido" : "Origem"}</p><p className="mt-1 text-sm font-semibold">{receipt.student?.initials ?? receipt.payer.source}</p>{receipt.student?.code && <code className="mt-1 block text-xs text-slate-500">{receipt.student.code}</code>}</div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><GraduationCap className="size-5 text-blue-600" /><p className="mt-3 text-xs text-slate-500">Referência da cobrança</p><code className="mt-2 block break-all text-xs font-semibold">{receipt.invoice_code || "—"}</code></div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 px-4 sm:px-5">
                <Detail label="Comprovativo" value={receipt.receipt_code} mono />
                <Detail label="Emitido em" value={formatDate(receipt.issued_at)} />
                <Detail label="Estado do pagamento" value={receipt.status === "paid" ? "Pago" : receipt.status} />
                <Detail label="ID do pagamento" value={receipt.payment_id} mono />
                <Detail label="Referência do pagamento" value={receipt.merchant_reference ?? "—"} mono />
                <Detail label="Transação do provedor" value={receipt.provider_transaction_id ?? "—"} mono />
              </div>

              <Alert className="mt-6 border-blue-100 bg-blue-50 text-blue-900 print:hidden"><LockKeyhole className="text-blue-600" /><AlertTitle>Privacidade preservada</AlertTitle><AlertDescription className="text-blue-700">Esta consulta mostra apenas os dados necessários para validar o comprovativo.</AlertDescription></Alert>

              <div className="mt-6 grid gap-3 print:hidden sm:grid-cols-2">
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => window.print()}><Printer /> Imprimir comprovativo</Button>
                <Button asChild className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700"><a href="/aluno/pagar"><ReceiptText /> Fazer outro pagamento</a></Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
