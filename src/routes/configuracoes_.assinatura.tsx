import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, Globe } from "lucide-react";
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
  type SubscriptionOverview,
} from "@/features/saas/subscription-server";
import { describeSubscription, formatBytes, usageShare } from "@/features/saas/subscription-view";
import { cn } from "@/lib/utils";

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

function SubscriptionDetail({ data }: { data: SubscriptionOverview }) {
  const state = describeSubscription(data, new Date());
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-6">
        <Panel title="Plano actual" icon={moduleIcons.subscription}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg">{data.plan?.name ?? "Sem plano"}</p>
              {data.plan?.description ? (
                <p className="text-sm text-muted-foreground">{data.plan.description}</p>
              ) : null}
              {kz(data.plan?.price_aoa_monthly) ? (
                <p className="mt-2 text-sm">
                  {kz(data.plan?.price_aoa_monthly)}
                  <span className="text-muted-foreground"> /mês</span>
                  {kz(data.plan?.price_aoa_yearly) ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {kz(data.plan?.price_aoa_yearly)} /ano
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <span className={cn(badgeBase, toneClass[state.tone])}>{state.label}</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{state.detail}</p>
          {state.trialProgress != null ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(state.trialProgress * 100)}%` }}
              />
            </div>
          ) : null}
        </Panel>

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

        <PlanComparison data={data} />
      </div>

      <div className="grid content-start gap-6">
        <PaymentPanel data={data} />
        <Panel title="Endereço da escola">
          <ul className="grid gap-2 text-sm">
            <li className="flex items-center gap-2">
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={`https://${data.subdomain}`}
                target="_blank"
                rel="noreferrer"
                className="truncate hover:underline"
              >
                {data.subdomain}
              </a>
            </li>
            {data.domains
              .filter((d) => d.hostname !== data.subdomain)
              .map((d) => (
                <li key={d.hostname} className="flex items-center justify-between gap-2">
                  <span className="truncate">{d.hostname}</span>
                  <span
                    className={cn(
                      badgeBase,
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

function PlanComparison({ data }: { data: SubscriptionOverview }) {
  const queryClient = useQueryClient();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const request = useServerFn(requestPlanChange);
  const cancel = useServerFn(cancelPlanChangeRequest);
  const requestMutation = useMutation({
    mutationFn: (planCode: string) => request({ data: { planCode: planCode as never, billing } }),
    onSuccess: (result) => {
      toast.success(
        `Pedido de mudança para ${result.planName} enviado. A equipa confirma o pagamento e activa o plano.`,
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
      description="O novo plano fica activo depois de a equipa confirmar o pagamento."
      action={
        <div
          className="flex rounded-md border p-0.5 text-xs"
          role="group"
          aria-label="Periodicidade"
        >
          {(
            [
              ["monthly", "Mensal"],
              ["yearly", "Anual"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={billing === value}
              onClick={() => setBilling(value)}
              className={cn(
                "rounded px-2 py-1 text-muted-foreground",
                billing === value && "bg-muted text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
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
          const price = billing === "yearly" ? plan.price_aoa_yearly : plan.price_aoa_monthly;
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
              {kz(price) ? (
                <p className="text-sm">
                  {kz(price)}
                  <span className="text-xs text-muted-foreground">
                    {billing === "yearly" ? " /ano" : " /mês"}
                  </span>
                </p>
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

function PaymentPanel({ data }: { data: SubscriptionOverview }) {
  const message = encodeURIComponent(
    `Olá, sou da escola ${data.schoolName} (${data.subdomain}). Envio o comprovativo do plano ${data.plan?.name ?? ""}.`,
  );
  return (
    <Panel title="Pagamento">
      <p className="text-sm text-muted-foreground">
        Pague por transferência e envie o comprovativo. A equipa valida e o plano fica activo.
      </p>
      {PAYMENT_IBAN ? (
        <dl className="mt-3 grid gap-1 rounded-md bg-muted/60 p-3 text-sm">
          <dt className="text-xs text-muted-foreground">IBAN</dt>
          <dd className="break-all font-mono text-xs tracking-wide">{PAYMENT_IBAN}</dd>
          {PAYMENT_BANK ? (
            <dd className="text-xs text-muted-foreground">Banco: {PAYMENT_BANK}</dd>
          ) : null}
          {PAYMENT_ACCOUNT_NAME ? (
            <dd className="text-xs text-muted-foreground">Titular: {PAYMENT_ACCOUNT_NAME}</dd>
          ) : null}
        </dl>
      ) : (
        <p className="mt-3 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          Os dados bancários são enviados pela equipa comercial.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Na descrição, indique <span className="text-foreground">{data.subdomain}</span>.
      </p>
      <div className="mt-4 grid gap-2">
        {SUPPORT_WHATSAPP ? (
          <Button asChild size="sm">
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${message}`}
              target="_blank"
              rel="noreferrer"
            >
              Enviar comprovativo por WhatsApp <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
        {SUPPORT_EMAIL ? (
          <Button asChild size="sm" variant="outline">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Comprovativo — ${data.schoolName}`)}&body=${message}`}
            >
              Enviar por e-mail
            </a>
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
