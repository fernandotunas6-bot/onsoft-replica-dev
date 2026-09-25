"use client";

import { FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Copy,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileText,
  GraduationCap,
  Hash,
  History,
  Home,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ReceiptText,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Upload,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Money } from "@/components/payflow/money";
import { PayflowBrandLockup } from "@/components/payflow/brand-mark";
import { PaymentStatusBadge } from "@/components/payflow/payment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { formatCurrency } from "@/lib/formatters";
import type { PaymentStatus } from "@/lib/payflow";

type Invoice = {
  id: string;
  code: string;
  description: string;
  period: string;
  amount: number;
  currency: string;
  due_date: string;
  status: string;
};

type StudentSession = {
  session_token: string;
  expires_at: string;
  sandbox: boolean;
  payments_enabled: boolean;
  payment_methods: PaymentMethod[];
  school: { id: string; tenant_id: string; code: string; name: string };
  student: { id: string; student_code: string; full_name: string; class_name: string };
  invoices: Invoice[];
};

type PaymentMethod = "mcx_express" | "payment_reference" | "bank_transfer";

type BankTransfer = {
  reference: string;
  status: string;
  beneficiary: string;
  bank_name: string;
  iban: string;
  amount: number;
  currency: string;
  expires_at: string;
  verified_at: string | null;
};

type InitiatedPayment = {
  payment_id: string;
  invoice_id: string;
  invoice_code: string;
  student_id: string;
  school_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  provider_transaction_id: string | null;
  merchant_reference: string;
  method: PaymentMethod;
  reference_data: { entity: string; reference: string } | null;
  bank_transfer: BankTransfer | null;
};

type PaymentHistory = {
  payment_id: string;
  invoice_id: string | null;
  invoice_code: string;
  description: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: string;
  provider: string;
  merchant_reference: string | null;
  provider_transaction_id: string | null;
  created_at: string;
  receipt_code: string | null;
  receipt_issued_at: string | null;
  verification_url: string | null;
};

type Receipt = {
  receipt_id: string;
  receipt_code: string;
  payment_id: string;
  invoice_id: string;
  invoice_code: string;
  school_id: string;
  student_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  provider_transaction_id: string;
  merchant_reference: string;
  paid_at: string;
  verification_url: string;
};

type PortalView = "home" | "payments" | "receipts" | "account" | "checkout";
type CheckoutStep = 1 | 2 | 3 | 4;

const portalNavigation = [
  { id: "home", label: "Início", icon: Home },
  { id: "payments", label: "Pagamentos", icon: CreditCard },
  { id: "receipts", label: "Recibos", icon: ReceiptText },
  { id: "account", label: "Conta", icon: CircleUserRound },
] as const;

const checkoutSteps = ["O que pagar", "Método", "Confirmar", "Resultado"];

const methodPresentation: Record<
  PaymentMethod,
  { label: string; description: string; icon: typeof Smartphone }
> = {
  mcx_express: {
    label: "MULTICAIXA Express",
    description: "Autorize a operação no canal móvel associado ao seu cartão.",
    icon: Smartphone,
  },
  payment_reference: {
    label: "Pagamento por referência",
    description: "Use uma entidade e referência num canal bancário compatível.",
    icon: Landmark,
  },
  bank_transfer: {
    label: "Transferência por IBAN",
    description: "Transfira para a conta da escola e envie o comprovativo para validação.",
    icon: Landmark,
  },
};

function formatDate(value: string, options?: { year?: boolean; time?: boolean }) {
  const hasTime = value.includes("T");
  const date = new Date(hasTime ? value : `${value}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(options?.time ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Africa/Luanda",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const months = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  const dateLabel = `${part("day")} ${months[Number(part("month")) - 1]}${
    options?.year ? ` ${part("year")}` : ""
  }`;
  return options?.time
    ? `${dateLabel} · ${part("hour")}:${part("minute")}`
    : dateLabel;
}

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getMethodLabel(value: string) {
  if (value === "mcx_express") return "MULTICAIXA Express";
  if (value === "payment_reference") return "Referência";
  if (value === "bank_transfer") return "Transferência por IBAN";
  return value || "Não indicado";
}

function copyValue(value: string, label: string) {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(label))
    .catch(() => toast.error("Não foi possível copiar."));
}

function Brand({ subtitle = "Portal financeiro" }: { subtitle?: string }) {
  return <PayflowBrandLockup subtitle={subtitle} size="sm" />;
}

function SandboxBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-amber-200 bg-amber-50 font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
    >
      <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      EMIS Sandbox
    </Badge>
  );
}

function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert
      variant="destructive"
      className="border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40"
      role="alert"
    >
      <AlertTitle>Não foi possível continuar</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof FileCheck2;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-3" aria-label="A carregar pagamentos">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
        >
          <Skeleton className="size-10 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

function PaymentHistoryList({
  items,
  loading,
  limit,
  receiptsOnly = false,
}: {
  items: PaymentHistory[];
  loading: boolean;
  limit?: number;
  receiptsOnly?: boolean;
}) {
  if (loading) return <HistorySkeleton />;

  const visibleItems = (
    receiptsOnly ? items.filter((item) => item.verification_url) : items
  ).slice(0, limit);

  if (!visibleItems.length) {
    return (
      <EmptyState
        icon={receiptsOnly ? ReceiptText : History}
        title={receiptsOnly ? "Nenhum recibo disponível" : "Nenhum pagamento encontrado"}
        description={
          receiptsOnly
            ? "Os recibos aparecem aqui depois da confirmação do pagamento."
            : "Quando fizer um pagamento, ele aparecerá aqui."
        }
      />
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
      {visibleItems.map((item) => (
        <article
          key={item.payment_id}
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            {item.verification_url ? (
              <ReceiptText className="size-[18px]" aria-hidden="true" />
            ) : (
              <History className="size-[18px]" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{item.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(item.created_at, { year: true })} · {getMethodLabel(item.method)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end sm:text-right">
            <div>
              <Money
                amountMinor={item.amount}
                currency={item.currency}
                className="text-sm font-semibold text-foreground"
              />
              <div className="mt-1 flex sm:justify-end">
                <PaymentStatusBadge status={item.status} />
              </div>
            </div>
            {item.verification_url && (
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="size-10 shrink-0"
                aria-label={`Ver recibo de ${item.description}`}
              >
                <a href={item.verification_url}>
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function PortalShell({
  session,
  currentView,
  onNavigate,
  onLogout,
  hideNavigation = false,
  children,
}: {
  session: StudentSession;
  currentView: PortalView;
  onNavigate: (view: Exclude<PortalView, "checkout">) => void;
  onLogout: () => void;
  hideNavigation?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="rounded-lg text-left"
            aria-label="Ir para o início"
          >
            <Brand subtitle="SIGA Plus" />
          </button>
          {!hideNavigation && (
            <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Navegação principal">
              {portalNavigation.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(item.id)}
                  aria-current={currentView === item.id ? "page" : undefined}
                  className={
                    currentView === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {item.label}
                </Button>
              ))}
            </nav>
          )}
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {session.sandbox && (
              <span className="hidden sm:inline-flex">
                <SandboxBadge />
              </span>
            )}
            <div className="hidden min-w-0 text-right lg:block">
              <p className="max-w-44 truncate text-xs font-medium text-foreground">
                {session.school.name}
              </p>
              <p className="text-[11px] text-muted-foreground">{session.school.code}</p>
            </div>
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
              aria-label={session.student.full_name}
            >
              {getInitials(session.student.full_name)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onLogout}
              aria-label="Terminar sessão"
              className="hidden size-9 sm:inline-flex"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10 ${
          !hideNavigation ? "pb-28 md:pb-10" : "pb-32 lg:pb-10"
        }`}
      >
        {children}
      </main>

      {!hideNavigation && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/97 px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1.5 backdrop-blur md:hidden"
          aria-label="Navegação do portal"
        >
          <div className="mx-auto grid max-w-md grid-cols-4">
            {portalNavigation.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-[19px]" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
      <Toaster position="top-right" richColors />
    </div>
  );
}

function CheckoutStepper({ currentStep }: { currentStep: CheckoutStep }) {
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label={`Etapa ${currentStep} de 4`}>
      {checkoutSteps.map((label, index) => {
        const number = index + 1;
        const complete = number < currentStep;
        const active = number === currentStep;
        return (
          <li key={label} className="min-w-0">
            <div className={`h-1 rounded-full ${number <= currentStep ? "bg-primary" : "bg-muted"}`} />
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                  complete
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "border border-primary text-primary"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {complete ? <CheckCircle2 className="size-3" aria-hidden="true" /> : number}
              </span>
              <span
                className={`hidden truncate text-xs sm:block ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function InvoiceBadge({ status }: { status: string }) {
  const overdue = status === "overdue";
  return (
    <Badge
      variant="outline"
      className={
        overdue
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          : "border-border bg-muted text-muted-foreground"
      }
    >
      {overdue ? "Em atraso" : "Em aberto"}
    </Badge>
  );
}

export function StudentPaymentPortal() {
  const [schoolCode, setSchoolCode] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<StudentSession | null>(null);
  const [view, setView] = useState<PortalView>("home");
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>(1);
  const [invoiceId, setInvoiceId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("mcx_express");
  const [payment, setPayment] = useState<InitiatedPayment | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [transferProof, setTransferProof] = useState<File | null>(null);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedInvoice = useMemo(
    () => session?.invoices.find((invoice) => invoice.id === invoiceId) ?? null,
    [invoiceId, session],
  );

  const totalBalance = useMemo(
    () => session?.invoices.reduce((sum, invoice) => sum + invoice.amount, 0) ?? 0,
    [session],
  );

  const nextInvoice = useMemo(
    () =>
      session
        ? [...session.invoices].sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null
        : null,
    [session],
  );

  const receipts = useMemo(
    () => history.filter((item) => item.verification_url),
    [history],
  );

  async function loadPaymentHistory(sessionToken: string) {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/v1/student/payments", {
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: "no-store",
      });
      const body = (await response.json()) as {
        data?: { items?: PaymentHistory[] };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Não foi possível carregar o histórico.");
      }
      const items = body.data.items ?? [];
      setHistory(items);
      return items;
    } catch (reason) {
      setHistoryError(
        reason instanceof Error ? reason.message : "Não foi possível carregar o histórico.",
      );
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }

  async function identifyStudent(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/v1/student/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_code: schoolCode,
          student_code: studentCode,
          pin,
        }),
      });
      const body = (await response.json()) as {
        data?: StudentSession;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Não foi possível identificar o aluno.");
      }
      setSession(body.data);
      setInvoiceId(body.data.invoices[0]?.id ?? "");
      setMethod(body.data.payment_methods[0] ?? "bank_transfer");
      setView("home");
      setCheckoutStep(1);
      void loadPaymentHistory(body.data.session_token);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível identificar o aluno.",
      );
    } finally {
      setLoading(false);
    }
  }

  function beginCheckout(invoice?: Invoice) {
    if (!session?.invoices.length || !session.payments_enabled) return;
    setInvoiceId(invoice?.id || invoiceId || session.invoices[0].id);
    setMethod(session.payment_methods[0] ?? "bank_transfer");
    setPayment(null);
    setReceipt(null);
    setTransferProof(null);
    setProofSubmitted(false);
    setError("");
    setCheckoutStep(1);
    setView("checkout");
  }

  async function initiatePayment() {
    if (!session || !selectedInvoice || !session.payments_enabled) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/v1/student/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session_token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ invoice_id: selectedInvoice.id, method }),
      });
      const body = (await response.json()) as {
        data?: InitiatedPayment;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Não foi possível iniciar o pagamento.");
      }
      setPayment(body.data);
      setCheckoutStep(4);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível iniciar o pagamento.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmSandboxPayment() {
    if (!session || !payment) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/student/payments/${payment.payment_id}/confirm`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.session_token}` },
        },
      );
      const body = (await response.json()) as {
        data?: Receipt;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Não foi possível confirmar o pagamento.");
      }
      const confirmedReceipt = body.data;
      setReceipt(confirmedReceipt);
      setSession((current) =>
        current
          ? {
              ...current,
              invoices: current.invoices.filter(
                (invoice) => invoice.id !== confirmedReceipt.invoice_id,
              ),
            }
          : current,
      );
      await loadPaymentHistory(session.session_token);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível confirmar o pagamento.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function uploadTransferProof() {
    if (!session || !payment || !transferProof) {
      setError("Selecione um comprovativo em PDF, JPG, PNG ou WebP.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      form.set("proof", transferProof);
      const response = await fetch(
        `/api/v1/student/payments/${payment.payment_id}/proof`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.session_token}` },
          body: form,
        },
      );
      const body = (await response.json()) as {
        data?: { status: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Não foi possível enviar o comprovativo.");
      }
      setProofSubmitted(true);
      setTransferProof(null);
      toast.success("Comprovativo recebido para validação.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível enviar o comprovativo.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshBankTransfer() {
    if (!session || !payment) return;
    setError("");
    const items = await loadPaymentHistory(session.session_token);
    const current = items.find((item) => item.payment_id === payment.payment_id);
    if (!current || current.status !== "paid" || !current.receipt_code || !current.verification_url) {
      toast.info("A transferência ainda está em validação.");
      return;
    }
    setReceipt({
      receipt_id: current.receipt_code,
      receipt_code: current.receipt_code,
      payment_id: current.payment_id,
      invoice_id: current.invoice_id ?? payment.invoice_id,
      invoice_code: current.invoice_code,
      school_id: payment.school_id,
      student_id: payment.student_id,
      amount: current.amount,
      currency: current.currency,
      status: current.status,
      provider: current.provider,
      provider_transaction_id: current.provider_transaction_id ?? "",
      merchant_reference: current.merchant_reference ?? payment.merchant_reference,
      paid_at: current.receipt_issued_at ?? new Date().toISOString(),
      verification_url: current.verification_url,
    });
    setSession((currentSession) =>
      currentSession
        ? {
            ...currentSession,
            invoices: currentSession.invoices.filter(
              (invoice) => invoice.id !== payment.invoice_id,
            ),
          }
        : currentSession,
    );
  }

  async function shareReceipt() {
    if (!receipt) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Recibo ${receipt.receipt_code}`,
          text: `Pagamento confirmado: ${formatCurrency(receipt.amount, receipt.currency)}.`,
          url: receipt.verification_url,
        });
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      }
    }
    copyValue(receipt.verification_url, "Ligação do recibo copiada");
  }

  function navigate(nextView: Exclude<PortalView, "checkout">) {
    setError("");
    setView(nextView);
  }

  function leaveCheckout() {
    setError("");
    setPayment(null);
    setReceipt(null);
    setTransferProof(null);
    setProofSubmitted(false);
    setCheckoutStep(1);
    setView("home");
  }

  function logout() {
    setSession(null);
    setView("home");
    setCheckoutStep(1);
    setInvoiceId("");
    setMethod("mcx_express");
    setPayment(null);
    setReceipt(null);
    setTransferProof(null);
    setProofSubmitted(false);
    setHistory([]);
    setHistoryError("");
    setError("");
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
            <Brand />
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(26rem,1fr)] lg:items-center lg:gap-14 lg:py-20">
          <section>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <GraduationCap className="size-[18px]" aria-hidden="true" />
              Ligado ao SIGA Plus
            </div>
            <h1 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              Consulte e pague as obrigações escolares num só lugar.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
              Use o código da instituição, o ID académico de 7 dígitos e o PIN
              financeiro fornecido pela escola.
            </p>
            <div className="mt-7 hidden space-y-4 lg:block">
              {[
                {
                  icon: ShieldCheck,
                  title: "Acesso protegido",
                  text: "As informações só aparecem depois da validação.",
                },
                {
                  icon: FileCheck2,
                  title: "Valores do SIGA",
                  text: "As cobranças vêm diretamente do registo escolar.",
                },
                {
                  icon: ReceiptText,
                  title: "Recibos centralizados",
                  text: "Cada pagamento confirmado gera um comprovativo verificável.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Card className="border-border py-0 shadow-[var(--shadow-soft)]">
            <CardContent className="p-5 sm:p-7">
              <form onSubmit={identifyStudent} className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-primary">
                    Portal financeiro
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    Aceder à conta
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Nenhum dado financeiro é mostrado antes da verificação.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="school-code">Código da escola</Label>
                  <div className="relative">
                    <Building2
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="school-code"
                      value={schoolCode}
                      onChange={(event) => setSchoolCode(event.target.value.toUpperCase())}
                      autoComplete="organization"
                      maxLength={30}
                      required
                      className="h-11 pl-9 uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="student-code">ID académico</Label>
                  <div className="relative">
                    <Hash
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="student-code"
                      value={studentCode}
                      onChange={(event) =>
                        setStudentCode(event.target.value.replace(/\D/g, "").slice(0, 7))
                      }
                      autoComplete="username"
                      inputMode="numeric"
                      pattern="\d{7}"
                      maxLength={7}
                      required
                      className="h-11 pl-9 font-mono tracking-[0.12em]"
                      aria-describedby="student-code-help"
                    />
                  </div>
                  <p id="student-code-help" className="text-xs text-muted-foreground">
                    Exatamente 7 dígitos.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-pin">PIN financeiro</Label>
                  <InputOTP
                    id="payment-pin"
                    maxLength={4}
                    value={pin}
                    onChange={setPin}
                    inputMode="numeric"
                    containerClassName="w-full"
                    aria-describedby="payment-pin-help"
                  >
                    <InputOTPGroup className="w-full gap-2">
                      {[0, 1, 2, 3].map((index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="h-12 flex-1 border-input bg-background text-base first:rounded-lg last:rounded-lg"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <p id="payment-pin-help" className="text-xs text-muted-foreground">
                    O PIN não é armazenado nesta página.
                  </p>
                </div>

                <InlineError message={error} />

                <Button
                  type="submit"
                  disabled={loading || pin.length !== 4 || studentCode.length !== 7}
                  className="h-12 w-full text-base"
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="animate-spin" /> A verificar…
                    </>
                  ) : (
                    <>
                      Entrar no portal <ArrowRight />
                    </>
                  )}
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <LockKeyhole className="size-3" aria-hidden="true" />
                  Nenhum dado bancário é recolhido.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
        <Toaster position="top-right" richColors />
      </main>
    );
  }

  if (view === "checkout") {
    const methodDetails = methodPresentation[method];

    return (
      <PortalShell
        session={session}
        currentView={view}
        onNavigate={navigate}
        onLogout={logout}
        hideNavigation
      >
        <button
          type="button"
          onClick={leaveCheckout}
          className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar ao portal
        </button>

        <div className="mb-7 max-w-3xl">
          <CheckoutStepper currentStep={checkoutStep} />
        </div>

        {!selectedInvoice ? (
          <EmptyState
            icon={FileCheck2}
            title="Nenhuma cobrança selecionada"
            description="Volte ao início para consultar as cobranças disponíveis."
            action={<Button onClick={leaveCheckout}>Voltar ao início</Button>}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <Card className="border-border py-0 shadow-[var(--shadow-soft)]">
              <CardContent className="p-5 sm:p-7">
                {checkoutStep === 1 && (
                  <section className="space-y-6">
                    <SectionHeading
                      title="O que deseja pagar?"
                      description="Escolha uma cobrança disponível para este aluno."
                    />
                    <RadioGroup
                      value={invoiceId}
                      onValueChange={setInvoiceId}
                      className="gap-3"
                    >
                      {session.invoices.map((invoice) => (
                        <label
                          key={invoice.id}
                          className={`flex cursor-pointer flex-col gap-4 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center ${
                            invoiceId === invoice.id
                              ? "border-primary bg-accent/60 ring-2 ring-primary/10"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-lg ${
                              invoiceId === invoice.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <FileText className="size-[18px]" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {invoice.description}
                              </span>
                              <InvoiceBadge status={invoice.status} />
                            </span>
                            <span className="mt-1.5 block text-xs text-muted-foreground">
                              Vence em {formatDate(invoice.due_date, { year: true })} ·{" "}
                              {invoice.period}
                            </span>
                          </span>
                          <span className="flex items-center justify-between gap-3 sm:block sm:text-right">
                            <Money
                              amountMinor={invoice.amount}
                              currency={invoice.currency}
                              className="font-semibold text-foreground"
                            />
                            <RadioGroupItem
                              value={invoice.id}
                              aria-label={invoice.description}
                              className="sm:ml-auto sm:mt-2"
                            />
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </section>
                )}

                {checkoutStep === 2 && (
                  <section className="space-y-6">
                    <SectionHeading
                      title="Escolha como pagar"
                      description="Estes são os métodos atualmente configurados pela instituição."
                    />
                    <RadioGroup
                      value={method}
                      onValueChange={(value) => setMethod(value as PaymentMethod)}
                      className="gap-3"
                    >
                      {session.payment_methods.map((value) => {
                        const presentation = methodPresentation[value];
                        const Icon = presentation.icon;
                        const selected = method === value;
                        return (
                          <label
                            key={value}
                            className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors ${
                              selected
                                ? "border-primary bg-accent/60 ring-2 ring-primary/10"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <span
                              className={`grid size-10 shrink-0 place-items-center rounded-lg ${
                                selected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Icon className="size-[18px]" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-foreground">
                                {presentation.label}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {presentation.description}
                              </span>
                            </span>
                            <RadioGroupItem value={value} aria-label={presentation.label} />
                          </label>
                        );
                      })}
                    </RadioGroup>
                    {session.sandbox && (
                      <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                        <ShieldCheck className="text-amber-700 dark:text-amber-300" />
                        <AlertTitle>Ambiente de simulação</AlertTitle>
                        <AlertDescription>
                          A operação não comunica com contas ou cartões reais.
                        </AlertDescription>
                      </Alert>
                    )}
                  </section>
                )}

                {checkoutStep === 3 && (
                  <section className="space-y-6">
                    <SectionHeading
                      title="Confirme os dados"
                      description="Revise a cobrança e o método antes de criar a solicitação de pagamento."
                    />
                    <div className="rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
                      <dl className="divide-y divide-border">
                        <InfoRow label="Aluno" value={session.student.full_name} />
                        <InfoRow label="Cobrança" value={selectedInvoice.description} />
                        <InfoRow label="Método" value={methodDetails.label} />
                        <InfoRow
                          label="Total"
                          value={formatCurrency(
                            selectedInvoice.amount,
                            selectedInvoice.currency,
                          )}
                        />
                      </dl>
                    </div>
                    <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                      <ShieldCheck
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      O estado só será apresentado como pago depois da confirmação do
                      provedor.
                    </p>
                    <InlineError message={error} />
                  </section>
                )}

                {checkoutStep === 4 && payment && !receipt && (
                  <section className="space-y-6 text-center" aria-live="polite">
                    <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      <RefreshCw
                        className={`size-6 ${loading ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        {payment.bank_transfer ? "Transferência pendente" : "Pagamento em confirmação"}
                      </p>
                      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                        {payment.bank_transfer ? "Faça a transferência pelo seu banco" : "A solicitação foi enviada"}
                      </h1>
                      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                        {payment.bank_transfer
                          ? "Use o IBAN, o valor exato e a referência abaixo. O comprovativo ajuda na análise, mas não confirma sozinho o recebimento."
                          : "Aguardamos a confirmação do provedor. Nenhum valor é apresentado como recebido antes dessa resposta."}
                      </p>
                    </div>
                    {payment.bank_transfer ? (
                      <div className="mx-auto max-w-md rounded-xl border border-border bg-muted/40 p-4 text-left">
                        <InfoRow label="Beneficiário" value={payment.bank_transfer.beneficiary} />
                        <InfoRow label="Banco" value={payment.bank_transfer.bank_name} />
                        <div className="flex items-center justify-between gap-4 border-b border-border py-3 text-sm">
                          <span className="text-muted-foreground">IBAN</span>
                          <span className="flex items-center gap-2 text-right">
                            <code className="font-medium text-foreground">{payment.bank_transfer.iban}</code>
                            <button type="button" onClick={() => copyValue(payment.bank_transfer!.iban, "IBAN copiado")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Copiar IBAN"><Copy className="size-4" /></button>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-border py-3 text-sm">
                          <span className="text-muted-foreground">Referência obrigatória</span>
                          <span className="flex items-center gap-2 text-right">
                            <code className="font-medium text-foreground">{payment.bank_transfer.reference}</code>
                            <button type="button" onClick={() => copyValue(payment.bank_transfer!.reference, "Referência copiada")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Copiar referência"><Copy className="size-4" /></button>
                          </span>
                        </div>
                        <InfoRow label="Valor exato" value={formatCurrency(payment.amount, payment.currency)} />
                        <InfoRow label="Válido até" value={formatDate(payment.bank_transfer.expires_at, { year: true, time: true })} />
                      </div>
                    ) : (
                      <div className="mx-auto max-w-md rounded-xl border border-border bg-muted/40 p-4 text-left">
                        {payment.reference_data ? (
                        <>
                          <InfoRow
                            label="Entidade"
                            value={payment.reference_data.entity}
                            mono
                          />
                          <InfoRow
                            label="Referência"
                            value={payment.reference_data.reference}
                            mono
                          />
                        </>
                      ) : (
                        <InfoRow
                          label="Referência"
                          value={payment.merchant_reference}
                          mono
                        />
                        )}
                        <InfoRow label="Valor" value={formatCurrency(payment.amount, payment.currency)} />
                        <InfoRow label="Método" value={methodPresentation[payment.method].label} />
                      </div>
                    )}

                    {payment.bank_transfer && (
                      <div className="mx-auto max-w-md space-y-4 text-left">
                        {proofSubmitted || payment.bank_transfer.status === "proof_submitted" ? (
                          <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                            <FileCheck2 />
                            <AlertTitle>Comprovativo recebido</AlertTitle>
                            <AlertDescription>
                              A transferência continua pendente até a entrada ser confirmada no extrato bancário.
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <div>
                            <Label htmlFor="student-transfer-proof">Comprovativo da transferência</Label>
                            <Input
                              id="student-transfer-proof"
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/webp"
                              onChange={(event) => setTransferProof(event.target.files?.[0] ?? null)}
                              className="mt-2 h-auto py-2"
                            />
                            <Button
                              disabled={loading || !transferProof}
                              onClick={uploadTransferProof}
                              className="mt-3 h-11 w-full"
                            >
                              {loading ? <><LoaderCircle className="animate-spin" /> A enviar…</> : <><Upload /> Enviar comprovativo</>}
                            </Button>
                          </div>
                        )}
                        <Button variant="outline" disabled={historyLoading} onClick={refreshBankTransfer} className="h-11 w-full">
                          {historyLoading ? <><LoaderCircle className="animate-spin" /> A verificar…</> : <><RefreshCw /> Atualizar estado</>}
                        </Button>
                        <p className="text-center text-xs leading-5 text-muted-foreground">
                          O recibo final será emitido somente depois da validação do movimento bancário.
                        </p>
                      </div>
                    )}
                    <InlineError message={error} />
                    {session.sandbox && payment.provider === "emis_sandbox" && (
                      <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-800 dark:bg-amber-950/50">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          Confirmação de teste
                        </p>
                        <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-300">
                          No ambiente real, esta atualização chegará por integração
                          segura com o provedor.
                        </p>
                        <Button
                          disabled={loading}
                          onClick={confirmSandboxPayment}
                          className="mt-4 h-11 w-full"
                        >
                          {loading ? (
                            <>
                              <LoaderCircle className="animate-spin" /> A confirmar…
                            </>
                          ) : (
                            <>
                              <RefreshCw /> Simular confirmação EMIS
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </section>
                )}

                {checkoutStep === 4 && receipt && (
                  <section className="space-y-6 text-center" aria-live="polite">
                    <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <CheckCircle2 className="size-7" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-success">
                        Pagamento concluído
                      </p>
                      <Money
                        amountMinor={receipt.amount}
                        currency={receipt.currency}
                        className="mt-2 block text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl"
                      />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedInvoice.description} · {session.student.full_name}
                      </p>
                    </div>
                    <div className="mx-auto max-w-md rounded-xl border border-border bg-muted/40 p-4 text-left">
                      <InfoRow label="Recibo" value={receipt.receipt_code} mono />
                      <InfoRow
                        label="Referência"
                        value={receipt.merchant_reference}
                        mono
                      />
                      <InfoRow
                        label="Data"
                        value={formatDate(receipt.paid_at, {
                          year: true,
                          time: true,
                        })}
                      />
                    </div>
                    <div className="mx-auto grid max-w-lg gap-3 sm:grid-cols-3">
                      <Button asChild variant="outline">
                        <a href={receipt.verification_url}>
                          Ver recibo <ExternalLink className="size-4" />
                        </a>
                      </Button>
                      <Button variant="outline" onClick={shareReceipt}>
                        <Share2 /> Partilhar
                      </Button>
                      <Button onClick={leaveCheckout}>Voltar ao início</Button>
                    </div>
                  </section>
                )}
              </CardContent>
            </Card>

            {checkoutStep < 4 && (
              <aside className="hidden rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] lg:sticky lg:top-24 lg:block">
                <p className="text-sm font-semibold text-foreground">
                  Resumo do pagamento
                </p>
                <div className="mt-4 flex items-start justify-between gap-4 border-b border-border pb-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {selectedInvoice.description}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedInvoice.code}
                    </p>
                  </div>
                  <Money
                    amountMinor={selectedInvoice.amount}
                    currency={selectedInvoice.currency}
                    className="shrink-0 text-sm font-medium"
                  />
                </div>
                <div className="flex items-end justify-between gap-4 py-4">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <Money
                    amountMinor={selectedInvoice.amount}
                    currency={selectedInvoice.currency}
                    className="text-xl font-semibold"
                  />
                </div>
                {checkoutStep === 1 && (
                  <Button
                    className="h-11 w-full"
                    onClick={() => setCheckoutStep(2)}
                  >
                    Continuar <ArrowRight />
                  </Button>
                )}
                {checkoutStep === 2 && (
                  <Button
                    className="h-11 w-full"
                    onClick={() => setCheckoutStep(3)}
                  >
                    Rever pagamento <ArrowRight />
                  </Button>
                )}
                {checkoutStep === 3 && (
                  <Button
                    className="h-11 w-full"
                    disabled={loading}
                    onClick={initiatePayment}
                  >
                    {loading ? (
                      <>
                        <LoaderCircle className="animate-spin" /> A processar…
                      </>
                    ) : (
                      <>
                        Confirmar pagamento <ArrowRight />
                      </>
                    )}
                  </Button>
                )}
                {checkoutStep > 1 && (
                  <Button
                    variant="ghost"
                    className="mt-2 w-full"
                    onClick={() =>
                      setCheckoutStep((checkoutStep - 1) as CheckoutStep)
                    }
                  >
                    <ArrowLeft /> Voltar
                  </Button>
                )}
              </aside>
            )}
          </div>
        )}

        {selectedInvoice && checkoutStep < 4 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Total</p>
                <Money
                  amountMinor={selectedInvoice.amount}
                  currency={selectedInvoice.currency}
                  className="block truncate text-lg font-semibold"
                />
              </div>
              {checkoutStep > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setCheckoutStep((checkoutStep - 1) as CheckoutStep)
                  }
                  aria-label="Voltar à etapa anterior"
                >
                  <ArrowLeft />
                </Button>
              )}
              {checkoutStep === 1 && (
                <Button className="h-11" onClick={() => setCheckoutStep(2)}>
                  Continuar <ArrowRight />
                </Button>
              )}
              {checkoutStep === 2 && (
                <Button className="h-11" onClick={() => setCheckoutStep(3)}>
                  Rever <ArrowRight />
                </Button>
              )}
              {checkoutStep === 3 && (
                <Button
                  className="h-11"
                  disabled={loading}
                  onClick={initiatePayment}
                >
                  {loading ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <>
                      Confirmar <ArrowRight />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </PortalShell>
    );
  }

  return (
    <PortalShell
      session={session}
      currentView={view}
      onNavigate={navigate}
      onLogout={logout}
    >
      {view === "home" && (
        <div className="space-y-8">
          <SectionHeading
            eyebrow={session.school.name}
            title="Olá."
            description={`Aqui está a situação financeira de ${session.student.full_name}.`}
          />

          {!session.payments_enabled && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <ShieldCheck className="text-warning" />
              <AlertTitle>Pagamentos temporariamente indisponíveis</AlertTitle>
              <AlertDescription>
                Pode consultar os valores e o histórico. A escola ativará novos pagamentos
                depois de concluir a configuração e homologação do provedor.
              </AlertDescription>
            </Alert>
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <Card className="border-border py-0 shadow-[var(--shadow-soft)]">
              <CardContent className="p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    Saldo em aberto
                  </p>
                  {session.sandbox && (
                    <span className="sm:hidden">
                      <SandboxBadge />
                    </span>
                  )}
                </div>
                <Money
                  amountMinor={totalBalance}
                  currency={nextInvoice?.currency ?? "AOA"}
                  className="mt-2 block text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-[40px]"
                />
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    className="h-12 w-full text-base sm:w-auto sm:min-w-44"
                    onClick={() => beginCheckout()}
                    disabled={!session.invoices.length || !session.payments_enabled}
                  >
                    Pagar agora <ArrowRight />
                  </Button>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {session.invoices.length
                      ? `${session.invoices.length} ${
                          session.invoices.length === 1
                            ? "cobrança disponível"
                            : "cobranças disponíveis"
                        }`
                      : "Nenhuma cobrança pendente"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border py-0 shadow-[var(--shadow-soft)]">
              <CardContent className="flex h-full flex-col justify-between p-5 sm:p-7">
                <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                  <CalendarDays className="size-[18px]" aria-hidden="true" />
                </span>
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground">
                    Próximo vencimento
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {nextInvoice
                      ? formatDate(nextInvoice.due_date, { year: true })
                      : "Conta em dia"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {nextInvoice?.description ?? "Não existem valores por pagar."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.02em]">Aluno</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Dados sincronizados com o SIGA Plus.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("payments")}
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-colors hover:bg-muted/40 sm:p-5"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                {getInitials(session.student.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-foreground">
                  {session.student.full_name}
                </span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">
                  {session.student.class_name} · ID {session.student.student_code}
                </span>
              </span>
              <span className="hidden text-right sm:block">
                <span className="block text-xs text-muted-foreground">Em aberto</span>
                <Money
                  amountMinor={totalBalance}
                  currency={nextInvoice?.currency ?? "AOA"}
                  className="mt-1 block font-semibold"
                />
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em]">
                  Pagamentos recentes
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Últimos movimentos desta conta.
                </p>
              </div>
              {history.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("payments")}
                >
                  Ver todos <ArrowRight />
                </Button>
              )}
            </div>
            {historyError ? (
              <HistoryError
                title="Não conseguimos carregar os pagamentos"
                onRetry={() => loadPaymentHistory(session.session_token)}
              />
            ) : (
              <PaymentHistoryList items={history} loading={historyLoading} limit={3} />
            )}
          </section>
        </div>
      )}

      {view === "payments" && (
        <div className="space-y-8">
          <SectionHeading
            title="Pagamentos"
            description="Consulte cobranças em aberto e o histórico desta conta."
            action={
              <Button
                onClick={() => beginCheckout()}
                disabled={!session.invoices.length || !session.payments_enabled}
              >
                Pagar agora <ArrowRight />
              </Button>
            }
          />

          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Em aberto</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Valores disponíveis para pagamento.
                </p>
              </div>
              <Badge variant="secondary">{session.invoices.length}</Badge>
            </div>
            {session.invoices.length ? (
              <div className="grid gap-3">
                {session.invoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => beginCheckout(invoice)}
                    className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <FileText className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {invoice.description}
                        </span>
                        <InvoiceBadge status={invoice.status} />
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {invoice.code} · vence em{" "}
                        {formatDate(invoice.due_date, { year: true })}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-3 sm:justify-end">
                      <Money
                        amountMinor={invoice.amount}
                        currency={invoice.currency}
                        className="font-semibold"
                      />
                      <ChevronRight
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileCheck2}
                title="Nenhum valor em aberto"
                description="Esta conta não possui cobranças disponíveis para pagamento."
              />
            )}
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Histórico</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pagamentos iniciados e confirmados.
              </p>
            </div>
            {historyError ? (
              <HistoryError
                title="Não conseguimos carregar o histórico"
                onRetry={() => loadPaymentHistory(session.session_token)}
              />
            ) : (
              <PaymentHistoryList items={history} loading={historyLoading} />
            )}
          </section>
        </div>
      )}

      {view === "receipts" && (
        <div className="space-y-8">
          <SectionHeading
            title="Recibos"
            description="Comprovativos emitidos para pagamentos confirmados."
          />
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <ReceiptText className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Recibos disponíveis</p>
                <p className="text-xs text-muted-foreground">
                  Cada documento pode ser validado pela sua ligação.
                </p>
              </div>
            </div>
            <span className="text-xl font-semibold tabular-nums">
              {receipts.length}
            </span>
          </div>
          {historyError ? (
            <HistoryError
              title="Não conseguimos carregar os recibos"
              onRetry={() => loadPaymentHistory(session.session_token)}
            />
          ) : (
            <PaymentHistoryList
              items={history}
              loading={historyLoading}
              receiptsOnly
            />
          )}
        </div>
      )}

      {view === "account" && (
        <div className="space-y-8">
          <SectionHeading
            title="Conta"
            description="Contexto escolar e dados usados nesta sessão financeira."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border py-0 shadow-[var(--shadow-soft)]">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <UserRound className="size-[18px]" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">Aluno</p>
                    <p className="font-semibold">{session.student.full_name}</p>
                  </div>
                </div>
                <Separator className="my-5" />
                <dl className="divide-y divide-border">
                  <InfoRow
                    label="ID académico"
                    value={session.student.student_code}
                    mono
                  />
                  <InfoRow label="Turma" value={session.student.class_name} />
                </dl>
              </CardContent>
            </Card>
            <Card className="border-border py-0 shadow-[var(--shadow-soft)]">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <Building2 className="size-[18px]" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">Instituição</p>
                    <p className="font-semibold">{session.school.name}</p>
                  </div>
                </div>
                <Separator className="my-5" />
                <dl className="divide-y divide-border">
                  <InfoRow label="Código" value={session.school.code} mono />
                  <InfoRow
                    label="Sessão válida até"
                    value={formatDate(session.expires_at, { time: true })}
                  />
                </dl>
              </CardContent>
            </Card>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Terminar sessão</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Será necessário informar novamente o ID académico e o PIN.
                </p>
              </div>
              <Button variant="outline" onClick={logout}>
                <LogOut /> Sair do portal
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

function HistoryError({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`break-words text-sm font-medium text-foreground sm:text-right ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
