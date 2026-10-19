import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CalendarX, Check, Gift, Globe, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { moduleIcons } from "@/lib/app-icons";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  cancelPlanChangeRequest,
  getMySubscription,
  requestPlanChange,
  setSubscriptionRenewal,
  type SubscriptionOverview,
} from "@/features/saas/subscription-server";
import {
  BILLING_PERIOD_LABEL,
  BILLING_PERIOD_UNIT,
  enabledPeriods,
  periodPrice,
  type BillingPeriodCode,
} from "@/features/saas/billing-periods";
import { planDetail } from "@/features/saas/plan-details";
import { PlanDetailsMore } from "@/features/saas/PlanDetailsMore";
import { describeSubscription, formatBytes, usageShare } from "@/features/saas/subscription-view";
import { cn } from "@/lib/utils";
import { PlanPaymentPanel } from "@/features/saas/PlanPaymentPanel";

export const Route = createFileRoute("/configuracoes_/assinatura")({
  head: () => ({
    meta: [
      { title: "Assinatura e plano · SIGA Plus" },
      {
        name: "description",
        content: "Plano, período experimental, uso, pagamento e domínio da escola.",
      },
    ],
  }),
  component: SubscriptionPage,
});

const PAYMENT_IBAN = String(import.meta.env["VITE_PAYMENT_IBAN"] ?? "").trim();
const PAYMENT_BANK = String(import.meta.env["VITE_PAYMENT_BANK"] ?? "").trim();
const PAYMENT_ACCOUNT_NAME = String(import.meta.env["VITE_PAYMENT_ACCOUNT_NAME"] ?? "").trim();
const SUPPORT_WHATSAPP = String(import.meta.env["VITE_SUPPORT_WHATSAPP"] ?? "").replace(/\D/g, "");
const SUPPORT_EMAIL = String(import.meta.env["VITE_SUPPORT_EMAIL"] ?? "").trim();

const kz = (value?: number | null) =>
  value == null
    ? null
    : new Intl.NumberFormat("pt-AO", {
        style: "currency",
        currency: "AOA",
        maximumFractionDigits: 0,
      }).format(value);

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })
    : null;

function SubscriptionPage() {
  const account = useCurrentAccount();
  const isAdmin = account.role === "Administrador";
  const fetchSubscription = useServerFn(getMySubscription);
  const query = useQuery({
    queryKey: ["saas", "my-subscription"],
    enabled: isAdmin,
    queryFn: () => fetchSubscription() as Promise<SubscriptionOverview>,
    staleTime: 60_000,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Sistema"
          title="Assinatura e plano"
          description="O plano da escola, o uso face aos limites, o pagamento e o endereço na internet."
          icon={moduleIcons.subscription}
        />
        {!account.profile.isLoading && !isAdmin ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              Só o Administrador da escola vê e gere a assinatura.
            </p>
          </Panel>
        ) : query.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar a assinatura…</p>
        ) : query.isError ? (
          <Panel title="Assinatura indisponível">
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : "Tente novamente."}
            </p>
          </Panel>
        ) : query.data ? (
          <SubscriptionDetail data={query.data} />
        ) : null}
      </div>
    </AppShell>
  );
}

export function SubscriptionDetail({ data }: { data: SubscriptionOverview }) {
  const periods = enabledPeriods(data.billing);
  const [period, setPeriod] = useState<BillingPeriodCode>(() =>
    data.billingPeriod && periods.some((p) => p.code === data.billingPeriod)
      ? data.billingPeriod
      : (periods[0]?.code ?? "monthly"),
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-6">
        <CurrentPlanPanel data={data} onChoosePeriod={setPeriod} />

        <Panel title="Uso" description={usageNote(data.usage.calculatedAt)}>
          <div className="grid gap-4 sm:grid-cols-3">
            <UsageMeter
              label="Alunos activos"
              used={data.usage.students}
              limit={data.limits.students}
            />
            <UsageMeter label="Pessoal" used={data.usage.staff} limit={data.limits.staff} />
            <UsageMeter
              label="Armazenamento"
              used={data.usage.storageBytes}
              limit={data.limits.storageGb != null ? data.limits.storageGb * 1024 ** 3 : null}
              format={formatBytes}
            />
          </div>
        </Panel>

        <PlanComparison data={data} period={period} onPeriodChange={setPeriod} />
      </div>

      <div className="grid min-w-0 content-start gap-6">
        {data.billingWaived ? (
          <Panel title="Pagamento">
            <p className="flex items-start gap-2 text-sm">
              <Gift className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                {data.billingExempt
                  ? "A sua escola está isenta de pagamento. Use o SIGA sem limite de tempo."
                  : (data.billing.notice ??
                    "Neste momento a plataforma não cobra assinaturas. Continue a usar o SIGA normalmente.")}
              </span>
            </p>
          </Panel>
        ) : (
          <PlanPaymentPanel data={data} period={period} onPeriodChange={setPeriod} />
        )}
        <Panel title="Endereço da escola">
          <ul className="grid min-w-0 gap-2 text-sm">
            <li className="flex min-w-0 items-center gap-2">
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={`https://${data.subdomain}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate hover:underline"
              >
                {data.subdomain}
              </a>
            </li>
            {data.domains
              .filter((d) => d.hostname !== data.subdomain)
              .map((d) => (
                <li key={d.hostname} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate" title={d.hostname}>
                    {d.hostname}
                  </span>
                  <span
                    className={cn(
                      badgeBase,
                      "shrink-0",
                      toneClass[d.status === "active" ? "success" : "warning"],
                    )}
                  >
                    {d.status === "active" ? "Activo" : "Por verificar"}
                  </span>
                </li>
              ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link to="/configuracoes" search={{ painel: "identidade" } as never}>
              Domínio próprio e e-mail
            </Link>
          </Button>
        </Panel>
      </div>
    </div>
  );
}

/**
 * Plano actual, como nas assinaturas do Claude: quanto paga e de quanto em
 * quanto tempo, quando é a próxima cobrança, poupar passando a anual e
 * cancelar a renovação mantendo o acesso até ao fim do período pago.
 */
function CurrentPlanPanel({
  data,
  onChoosePeriod,
}: {
  data: SubscriptionOverview;
  onChoosePeriod: (period: BillingPeriodCode) => void;
}) {
  const queryClient = useQueryClient();
  const renewal = useServerFn(setSubscriptionRenewal);
  const [confirming, setConfirming] = useState(false);
  const state = describeSubscription(data, new Date());
  const paidPeriod = data.billingPeriod;
  const paid = paidPeriod
    ? periodPrice(data.plan?.price_aoa_monthly, paidPeriod, data.billing)
    : null;
  const active = data.subscriptionStatus === "active" && !data.billingWaived;
  const yearlyEnabled = data.billing.periods.some((p) => p.code === "yearly" && p.enabled);
  const yearly = periodPrice(data.plan?.price_aoa_monthly, "yearly", data.billing);
  const suggestYearly =
    !data.billingWaived &&
    yearlyEnabled &&
    yearly &&
    yearly.savingsKz > 0 &&
    paidPeriod !== "yearly";

  const renewalMutation = useMutation({
    mutationFn: (renew: boolean) => renewal({ data: { renew } }),
    onSuccess: (_result, renew) => {
      setConfirming(false);
      toast.success(
        renew
          ? "Renovação retomada. A assinatura continua sem interrupções."
          : `Renovação cancelada. Mantém o acesso até ${date(data.periodEnd)}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["saas", "my-subscription"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar."),
  });

  return (
    <Panel title="Plano actual" icon={moduleIcons.subscription}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg">{data.plan?.name ?? "Sem plano"}</p>
          <p className="text-sm text-muted-foreground">
            {planDetail(data.plan?.code)?.pitch ?? data.plan?.description}
          </p>
          {data.billingWaived ? (
            <p className="mt-2 text-sm">
              <span className={cn(badgeBase, toneClass.success)}>Sem cobrança</span>
            </p>
          ) : paid && paidPeriod ? (
            <p className="mt-2 text-sm">
              {kz(paid.total)}
              <span className="text-muted-foreground">
                {" "}
                cobrado {BILLING_PERIOD_UNIT[paidPeriod]}
                {paid.months > 1 ? ` · ${kz(paid.perMonth)}/mês` : ""}
              </span>
            </p>
          ) : kz(data.plan?.price_aoa_monthly) ? (
            <p className="mt-2 text-sm">
              {kz(data.plan?.price_aoa_monthly)}
              <span className="text-muted-foreground"> /mês</span>
            </p>
          ) : null}
        </div>
        <span className={cn(badgeBase, toneClass[state.tone])}>{state.label}</span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{state.detail}</p>
      {state.trialProgress != null && !data.billingWaived ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(state.trialProgress * 100)}%` }}
          />
        </div>
      ) : null}

      {active && data.periodEnd ? (
        <div className="mt-4 grid gap-2 rounded-lg border border-border/70 p-3 text-sm">
          {data.cancelAtPeriodEnd ? (
            <>
              <p>
                <CalendarX className="mr-1.5 inline size-4 text-warning" />A assinatura termina a{" "}
                <strong className="font-medium">{date(data.periodEnd)}</strong>. Até lá, tudo
                funciona normalmente.
              </p>
              <div>
                <Button
                  size="sm"
                  disabled={renewalMutation.isPending}
                  onClick={() => renewalMutation.mutate(true)}
                >
                  Retomar a assinatura
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                <CalendarClock className="mr-1.5 inline size-4 text-primary" />
                Próxima cobrança a <strong className="font-medium">{date(data.periodEnd)}</strong>
                {paid ? ` · ${kz(paid.total)}` : ""}.
              </p>
              {confirming ? (
                <div className="grid gap-2 rounded-md bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    Mantém o acesso a tudo até {date(data.periodEnd)}. Depois, a escola deixa de
                    poder entrar até pagar de novo — os dados ficam guardados.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={renewalMutation.isPending}
                      onClick={() => renewalMutation.mutate(false)}
                    >
                      Cancelar renovação
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                      Manter assinatura
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                    Cancelar renovação
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {suggestYearly && yearly ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="min-w-0">
            <Sparkles className="mr-1.5 inline size-4 text-primary" />
            Pague anualmente e poupe <strong className="font-medium">
              {kz(yearly.savingsKz)}
            </strong>{" "}
            por ano ({yearly.savingsPct}%) — {kz(yearly.perMonth)}/mês.
          </p>
          <Button size="sm" variant="outline" onClick={() => onChoosePeriod("yearly")}>
            Mudar para anual
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

function usageNote(calculatedAt: string | null) {
  return calculatedAt
    ? `Contagem de ${new Date(calculatedAt).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}.`
    : "A contagem é actualizada automaticamente.";
}

function UsageMeter({
  label,
  used,
  limit,
  format = (v: number) => v.toLocaleString("pt-AO"),
}: {
  label: string;
  used: number;
  limit: number | null;
  format?: (value: number) => string;
}) {
  const share = usageShare(used, limit);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">
        {format(used)}
        {limit ? <span className="text-muted-foreground"> de {format(limit)}</span> : null}
      </p>
      {share != null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              share >= 1 ? "bg-destructive" : share >= 0.85 ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Sem limite</p>
      )}
    </div>
  );
}

export function PeriodToggle({
  data,
  period,
  onChange,
}: {
  data: SubscriptionOverview;
  period: BillingPeriodCode;
  onChange: (period: BillingPeriodCode) => void;
}) {
  const periods = enabledPeriods(data.billing);
  if (periods.length < 2) return null;
  return (
    <div
      className="flex flex-wrap rounded-md border p-0.5 text-xs"
      role="group"
      aria-label="Periodicidade"
    >
      {periods.map((p) => (
        <button
          key={p.code}
          type="button"
          aria-pressed={period === p.code}
          onClick={() => onChange(p.code)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground",
            period === p.code && "bg-muted text-foreground",
          )}
        >
          {BILLING_PERIOD_LABEL[p.code]}
          {p.discountPct > 0 ? (
            <span className="rounded bg-success/15 px-1 text-[10px] font-semibold text-success">
              −{Math.round(p.discountPct)}%
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function PlanComparison({
  data,
  period,
  onPeriodChange,
}: {
  data: SubscriptionOverview;
  period: BillingPeriodCode;
  onPeriodChange: (period: BillingPeriodCode) => void;
}) {
  const queryClient = useQueryClient();
  const request = useServerFn(requestPlanChange);
  const cancel = useServerFn(cancelPlanChangeRequest);
  const requestMutation = useMutation({
    mutationFn: (planCode: string) =>
      request({ data: { planCode: planCode as never, billing: period } }),
    onSuccess: (result) => {
      toast.success(
        data.billingWaived
          ? `Pedido de mudança para ${result.planName} enviado. A equipa activa o plano.`
          : `Pedido de mudança para ${result.planName} enviado. A equipa confirma o pagamento e activa o plano.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["saas", "my-subscription"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o pedido."),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancel(),
    onSuccess: () => {
      toast.success("Pedido de mudança cancelado.");
      void queryClient.invalidateQueries({ queryKey: ["saas", "my-subscription"] });
    },
  });
  const pending = data.pendingPlanRequest;
  const pendingName = pending ? data.plans.find((p) => p.code === pending.planCode)?.name : null;

  return (
    <Panel
      title="Mudar de plano"
      description={
        data.billingWaived
          ? "A equipa activa o novo plano a seu pedido."
          : "O novo plano fica activo depois de a equipa confirmar o pagamento."
      }
      action={
        data.billingWaived ? null : (
          <PeriodToggle data={data} period={period} onChange={onPeriodChange} />
        )
      }
    >
      {pending ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
          <span>
            Pedido de mudança para{" "}
            <strong className="font-medium">{pendingName ?? pending.planCode}</strong> enviado a{" "}
            {date(pending.requestedAt)}.
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            Cancelar pedido
          </Button>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.plans.map((plan) => {
          const current = plan.id === data.plan?.id;
          const price = data.billingWaived
            ? null
            : periodPrice(plan.price_aoa_monthly, period, data.billing);
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-4",
                current && "border-primary bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{plan.name}</span>
                {current ? (
                  <span className={cn(badgeBase, toneClass.primary)}>Plano actual</span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {planDetail(plan.code)?.pitch ?? plan.description}
              </p>
              {price ? (
                <div>
                  <p className="text-sm">
                    {kz(price.perMonth)}
                    <span className="text-xs text-muted-foreground"> /mês</span>
                  </p>
                  {price.months > 1 ? (
                    <p className="text-xs text-muted-foreground">
                      {kz(price.total)} cobrado {BILLING_PERIOD_UNIT[period]}
                      {price.savingsKz > 0 ? (
                        <span className="text-success"> · poupa {kz(price.savingsKz)}</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <ul className="grid gap-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  {plan.max_students
                    ? `Até ${plan.max_students.toLocaleString("pt-AO")} alunos`
                    : "Alunos sem limite"}
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  {plan.max_staff
                    ? `Até ${plan.max_staff.toLocaleString("pt-AO")} pessoas na equipa`
                    : "Equipa sem limite"}
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  {plan.max_storage_gb
                    ? `${plan.max_storage_gb} GB de arquivos`
                    : "Armazenamento alargado"}
                </li>
              </ul>
              <PlanDetailsMore code={plan.code} />
              {!current ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-auto"
                  disabled={requestMutation.isPending || pending?.planCode === plan.code}
                  onClick={() => requestMutation.mutate(plan.code)}
                >
                  {pending?.planCode === plan.code ? "Pedido enviado" : "Pedir este plano"}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
