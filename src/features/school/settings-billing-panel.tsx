import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  getSchoolSettings,
  updateBillingSettings,
  type SchoolSettingsBundle,
} from "@/features/school/server";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import {
  listFeePlanSettings,
  saveGradeTuitionPrices,
  upsertFeePlanSettings,
} from "@/features/finance/server";
import { DEFAULT_FEE_PLAN_NAME } from "@/features/finance/fee-plan-defaults";
import { toastActionError } from "@/lib/action-error-toast";
import { kwanza } from "@/lib/currency";

/** Onde a multa se aplica (BillingSettings.late_fee_scope). */
const LATE_FEE_SCOPES = [
  { id: "all", label: "Em todos os pagamentos" },
  {
    id: "electronic",
    label: "Só nos electrónicos (Multicaixa, referência, Express, Unitel Money, AppyPay)",
  },
] as const;
type LateFeeScope = (typeof LATE_FEE_SCOPES)[number]["id"];

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

  const billing = billingQuery.data;
  const items = [
    { label: "Dia de vencimento", valor: `${billing.due_day} de cada mês` },
    {
      label: "Multa por atraso",
      valor: billing.late_fee_percent > 0 ? `${billing.late_fee_percent}%` : "Sem multa",
    },
    { label: "Tolerância", valor: `${billing.grace_days} dias` },
    ...(billing.late_fee_percent > 0
      ? [
          {
            label: "Multa aplica-se",
            valor:
              billing.late_fee_scope === "electronic"
                ? "Só nos pagamentos electrónicos"
                : "Em todos os pagamentos",
          },
        ]
      : []),
    {
      label: "Desconto irmãos",
      valor:
        billing.sibling_discount_percent > 0
          ? `${billing.sibling_discount_percent}%`
          : "Sem desconto",
    },
  ];

  return (
    <>
      {billing.configured ? null : (
        <p className="mb-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Regras ainda não definidas pela escola: até as guardar, não há multa nem desconto de
          irmãos.
        </p>
      )}
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums">{item.valor}</span>
          </li>
        ))}
      </ul>
    </>
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
  // Iguais aos valores por omissão de settings-domains.ts (sem multa nem desconto).
  const [values, setValues] = useState({ due: "10", fee: "0", grace: "0", discount: "0" });
  const [scope, setScope] = useState<LateFeeScope>("all");
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
    setScope(billingQuery.data.late_fee_scope);
  }, [billingQuery.data]);

  const billingDirty = Boolean(
    billingQuery.data &&
    (values.due !== String(billingQuery.data.due_day) ||
      values.fee !== String(billingQuery.data.late_fee_percent) ||
      values.grace !== String(billingQuery.data.grace_days) ||
      values.discount !== String(billingQuery.data.sibling_discount_percent) ||
      scope !== billingQuery.data.late_fee_scope),
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
          lateFeeScope: scope,
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="multa-ambito">Onde se aplica a multa</Label>
          <Select value={scope} onValueChange={(value) => setScope(value as LateFeeScope)}>
            <SelectTrigger id="multa-ambito">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LATE_FEE_SCOPES.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Aplica-se uma vez, no primeiro pagamento depois do vencimento e da tolerância. Com «Só
            nos electrónicos», o numerário e a transferência na tesouraria ficam sem multa.
          </p>
        </div>
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
  // Propina por classe: vazio = usa a propina geral (fee-items.ts).
  const [gradeAmounts, setGradeAmounts] = useState<Record<string, string>>({});
  const [savingGrades, setSavingGrades] = useState(false);

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
    setGradeAmounts(
      Object.fromEntries(
        (feePlanQuery.data.gradePrices ?? []).map((grade) => [
          grade.grade_level_id,
          amountText(grade.amount ?? undefined),
        ]),
      ),
    );
  }, [feePlanQuery.data]);

  const gradeChanges = (feePlanQuery.data?.gradePrices ?? []).filter(
    (grade) => (gradeAmounts[grade.grade_level_id] ?? "") !== amountText(grade.amount ?? undefined),
  );

  const feePlanDirty = Boolean(
    feePlanQuery.data &&
    (planName !== (feePlanQuery.data.plan?.name ?? DEFAULT_FEE_PLAN_NAME) ||
      tuitionAmount !==
        amountText(feePlanQuery.data.items.find((item) => item.kind === "tuition")?.amount) ||
      enrollmentAmount !==
        amountText(feePlanQuery.data.items.find((item) => item.kind === "enrollment")?.amount)),
  );

  useEffect(() => {
    stackNav?.reportDirty(feePlanDirty || gradeChanges.length > 0);
  }, [feePlanDirty, gradeChanges.length, stackNav]);

  const saveGradePrices = async () => {
    const prices = gradeChanges.map((grade) => {
      const text = (gradeAmounts[grade.grade_level_id] ?? "").replace(/\s/g, "").replace(",", ".");
      return { gradeLevelId: grade.grade_level_id, amount: text ? Number(text) : null };
    });
    if (prices.some((price) => price.amount !== null && !(price.amount > 0))) {
      toast.error("Os preços por classe têm de ser maiores que zero (ou ficar vazios).");
      return;
    }
    setSavingGrades(true);
    try {
      const data = await saveGradeTuitionPrices({ data: { prices } });
      queryClient.setQueryData(["finance", "fee-plan-settings"], data);
      toast.success("Preços por classe actualizados.");
    } catch (error) {
      toastActionError(error, "Não foi possível guardar os preços por classe.");
    } finally {
      setSavingGrades(false);
    }
  };

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
      {ready && feePlanQuery.data?.gradePricing && feePlanQuery.data.gradePrices.length ? (
        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-semibold">Propina por classe</p>
            <p className="text-xs text-muted-foreground">
              Vazio = usa a propina mensal acima. A fatura de propina usa o preço da classe do
              aluno; o valor escrito na fatura continua a valer, se o indicar.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {feePlanQuery.data.gradePrices.map((grade) => (
              <div key={grade.grade_level_id} className="space-y-1.5">
                <Label htmlFor={`grade-price-${grade.grade_level_id}`}>
                  {grade.name}
                  {grade.program ? ` · ${grade.program}` : ""}
                </Label>
                <Input
                  id={`grade-price-${grade.grade_level_id}`}
                  type="number"
                  min={1}
                  step={1000}
                  placeholder={tuitionAmount ? `Geral: ${tuitionAmount}` : "Propina geral"}
                  value={gradeAmounts[grade.grade_level_id] ?? ""}
                  onChange={(event) =>
                    setGradeAmounts((current) => ({
                      ...current,
                      [grade.grade_level_id]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => void saveGradePrices()}
              disabled={savingGrades || gradeChanges.length === 0}
            >
              {savingGrades ? "A guardar…" : "Guardar preços por classe"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
