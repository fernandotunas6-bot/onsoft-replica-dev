import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  getSchoolSettings,
  updateBillingSettings,
  type SchoolSettingsBundle,
} from "@/features/school/server";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { listFeePlanSettings, upsertFeePlanSettings } from "@/features/finance/server";
import { DEFAULT_FEE_PLAN_NAME } from "@/features/finance/fee-plan-defaults";
import { toastActionError } from "@/lib/action-error-toast";
import { kwanza } from "@/lib/currency";

export function BillingParametersSummary() {
  const currentUser = useCurrentAccount();
  const canManage = ["Administrador", "Tesouraria"].includes(currentUser.role);
  const billingQuery = useQuery({
    queryKey: ["school", "billing-settings"],
    enabled: canManage,
    queryFn: async () => (await (getSchoolSettings() as Promise<SchoolSettingsBundle>)).billing,
    staleTime: 5 * 60_000,
  });

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Disponível apenas para Administração e Tesouraria.
      </p>
    );
  }
  if (billingQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">A carregar parâmetros…</p>;
  }
  if (!billingQuery.data) {
    return <p className="text-sm text-destructive">Parâmetros financeiros indisponíveis.</p>;
  }

  const items = [
    { label: "Dia de vencimento", valor: `${billingQuery.data.due_day} de cada mês` },
    { label: "Multa por atraso", valor: `${billingQuery.data.late_fee_percent}%` },
    { label: "Tolerância", valor: `${billingQuery.data.grace_days} dias` },
    { label: "Desconto irmãos", valor: `${billingQuery.data.sibling_discount_percent}%` },
  ];

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.valor}</span>
        </li>
      ))}
    </ul>
  );
}

export function BillingSettingsForm() {
  const currentUser = useCurrentAccount();
  const stackNav = useOptionalStackNav();
  const queryClient = useQueryClient();
  const installed = useInstalledIntegrations();
  const multicaixaOn = installed.isInstalled("multicaixa_express");
  const unitelOn = installed.isInstalled("unitel_money");
  const canManage = ["Administrador", "Tesouraria"].includes(currentUser.role);
  const [values, setValues] = useState({ due: "10", fee: "2", grace: "5", discount: "10" });
  const [saving, setSaving] = useState(false);
  const billingQuery = useQuery({
    queryKey: ["school", "billing-settings"],
    enabled: canManage,
    queryFn: async () => (await (getSchoolSettings() as Promise<SchoolSettingsBundle>)).billing,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!billingQuery.data) return;
    setValues({
      due: String(billingQuery.data.due_day),
      fee: String(billingQuery.data.late_fee_percent),
      grace: String(billingQuery.data.grace_days),
      discount: String(billingQuery.data.sibling_discount_percent),
    });
  }, [billingQuery.data]);

  const billingDirty = Boolean(
    billingQuery.data &&
    (values.due !== String(billingQuery.data.due_day) ||
      values.fee !== String(billingQuery.data.late_fee_percent) ||
      values.grace !== String(billingQuery.data.grace_days) ||
      values.discount !== String(billingQuery.data.sibling_discount_percent)),
  );

  useEffect(() => {
    stackNav?.reportDirty(billingDirty);
  }, [billingDirty, stackNav]);

  const saveBilling = async () => {
    const due = Number(values.due);
    const fee = Number(values.fee);
    const grace = Number(values.grace);
    const discount = Number(values.discount);
    if (
      !Number.isInteger(due) ||
      due < 1 ||
      due > 28 ||
      !Number.isInteger(grace) ||
      grace < 0 ||
      grace > 60 ||
      !Number.isFinite(fee) ||
      fee < 0 ||
      fee > 100 ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100
    ) {
      toast.error("Revise os limites das regras de cobrança.");
      return;
    }
    if (!billingQuery.data) return;
    setSaving(true);
    try {
      const data = await updateBillingSettings({
        data: {
          dueDay: due,
          lateFeePercent: fee,
          graceDays: grace,
          siblingDiscountPercent: discount,
        },
      });
      if (!data) {
        await billingQuery.refetch();
        toast.error("As regras foram alteradas noutro dispositivo. Reveja os valores.");
        return;
      }
      queryClient.setQueryData(["school", "billing-settings"], data);
      toast.success("Regras de cobrança actualizadas.");
    } catch (error) {
      toastActionError(error, "Não foi possível actualizar as regras de cobrança.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Disponível apenas para Administração e Tesouraria.
      </p>
    );
  }
  if (billingQuery.isLoading)
    return <p className="text-sm text-muted-foreground">A carregar regras…</p>;
  if (!billingQuery.data)
    return <p className="text-sm text-destructive">Regras de cobrança indisponíveis.</p>;

  const fields = [
    { id: "venc", key: "due", label: "Dia de vencimento", min: 1, max: 28 },
    { id: "multa", key: "fee", label: "Multa por atraso (%)", min: 0, max: 100 },
    { id: "tolerancia", key: "grace", label: "Tolerância (dias)", min: 0, max: 60 },
    { id: "desconto", key: "discount", label: "Desconto irmãos (%)", min: 0, max: 100 },
  ] as const;

  return (
    <div className="space-y-4">
      {multicaixaOn || unitelOn ? (
        <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm">
          <p className="font-semibold">Canais de pagamento instalados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {multicaixaOn
              ? "Multicaixa Express: referências EMIS em Financeiro → Planos e Faturas. "
              : ""}
            {unitelOn ? "Unitel Money: cobrança móvel nos planos e recibos." : ""}
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id}>{field.label}</Label>
            <Input
              id={field.id}
              type="number"
              min={field.min}
              max={field.max}
              step={field.key === "fee" || field.key === "discount" ? 0.01 : 1}
              value={values[field.key]}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={saveBilling} disabled={saving}>
          {saving ? "A guardar…" : "Guardar cobrança"}
        </Button>
      </div>
    </div>
  );
}

export function FeePlanSettingsForm() {
  const currentUser = useCurrentAccount();
  const stackNav = useOptionalStackNav();
  const queryClient = useQueryClient();
  const canManage = ["Administrador", "Tesouraria"].includes(currentUser.role);
  // Sem preço definido (ou 0, "por definir") o campo fica vazio: nunca um
  // valor de exemplo que pareça ser o preço da escola.
  const amountText = (amount: number | undefined) => (amount && amount > 0 ? String(amount) : "");
  const [planName, setPlanName] = useState(DEFAULT_FEE_PLAN_NAME);
  const [tuitionAmount, setTuitionAmount] = useState("");
  const [enrollmentAmount, setEnrollmentAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const feePlanQuery = useQuery({
    queryKey: ["finance", "fee-plan-settings"],
    enabled: canManage,
    queryFn: () => listFeePlanSettings(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!feePlanQuery.data) return;
    if (feePlanQuery.data.plan?.name) setPlanName(feePlanQuery.data.plan.name);
    const tuition = feePlanQuery.data.items.find((item) => item.kind === "tuition");
    const enrollment = feePlanQuery.data.items.find((item) => item.kind === "enrollment");
    setTuitionAmount(amountText(tuition?.amount));
    setEnrollmentAmount(amountText(enrollment?.amount));
  }, [feePlanQuery.data]);

  const feePlanDirty = Boolean(
    feePlanQuery.data &&
    (planName !== (feePlanQuery.data.plan?.name ?? DEFAULT_FEE_PLAN_NAME) ||
      tuitionAmount !==
        amountText(feePlanQuery.data.items.find((item) => item.kind === "tuition")?.amount) ||
      enrollmentAmount !==
        amountText(feePlanQuery.data.items.find((item) => item.kind === "enrollment")?.amount)),
  );

  useEffect(() => {
    stackNav?.reportDirty(feePlanDirty);
  }, [feePlanDirty, stackNav]);

  const saveFeePlan = async () => {
    const tuition = Number(tuitionAmount.replace(/\s/g, "").replace(",", "."));
    const enrollment = Number(enrollmentAmount.replace(/\s/g, "").replace(",", "."));
    if (
      !Number.isFinite(tuition) ||
      tuition <= 0 ||
      !Number.isFinite(enrollment) ||
      enrollment <= 0
    ) {
      toast.error("Indique os valores da propina mensal e da taxa de matrícula da escola.");
      return;
    }
    setSaving(true);
    try {
      const data = await upsertFeePlanSettings({
        data: {
          planName: planName.trim() || DEFAULT_FEE_PLAN_NAME,
          tuitionAmount: tuition,
          enrollmentAmount: enrollment,
        },
      });
      queryClient.setQueryData(["finance", "fee-plan-settings"], data);
      toast.success("Plano de propinas actualizado.");
    } catch (error) {
      toastActionError(error, "Não foi possível guardar o plano de propinas.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Disponível apenas para Administração e Tesouraria.
      </p>
    );
  }
  if (feePlanQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">A carregar plano financeiro…</p>;
  }

  const ready = feePlanQuery.data?.ready ?? false;

  return (
    <div className="space-y-4">
      {!ready ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-sm">
          <p className="font-semibold text-warning">Plano financeiro em falta</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem plano activo não é possível emitir faturas de propina ou matrícula. Configure os
            valores abaixo — o plano pertence ao ano lectivo activo, por isso defina-o primeiro em
            Calendário Lectivo se ainda não existir.
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fee-plan-name">Nome do plano</Label>
          <Input
            id="fee-plan-name"
            value={planName}
            onChange={(event) => setPlanName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fee-tuition">Propina mensal (Kz)</Label>
          <Input
            id="fee-tuition"
            type="number"
            min={1}
            step={1000}
            placeholder="Por definir"
            value={tuitionAmount}
            onChange={(event) => setTuitionAmount(event.target.value)}
          />
          {Number(tuitionAmount) > 0 ? (
            <p className="text-xs text-muted-foreground">{kwanza(Number(tuitionAmount))}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fee-enrollment">Taxa de matrícula (Kz)</Label>
          <Input
            id="fee-enrollment"
            type="number"
            min={1}
            step={1000}
            placeholder="Por definir"
            value={enrollmentAmount}
            onChange={(event) => setEnrollmentAmount(event.target.value)}
          />
          {Number(enrollmentAmount) > 0 ? (
            <p className="text-xs text-muted-foreground">{kwanza(Number(enrollmentAmount))}</p>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Estes valores alimentam a emissão de faturas em Financeiro e Faturas. Contratos financeiros
        por aluno são criados automaticamente na primeira fatura.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => void saveFeePlan()} disabled={saving}>
          {saving ? "A guardar…" : ready ? "Guardar propinas" : "Activar plano financeiro"}
        </Button>
      </div>
    </div>
  );
}
