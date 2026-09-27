import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InlineLoading } from "@/components/ui/inline-loading";
import { toastActionError } from "@/lib/action-error-toast";
import { formatPortalDate } from "@/features/dashboard/portals/portal-format";
import {
  DECREE_424_25_MODEL,
  ROUNDING_LABELS,
  ROUNDING_METHODS,
  draftFromRule,
  formulaText,
  DEFAULT_PROMOTION_RULES,
  PROMOTION_CYCLES,
  PROMOTION_CYCLE_LABELS,
  describePromotionRule,
  type PromotionCycleRule,
  ruleChanges,
  termAverageByRule,
  validateRuleDraft,
  type AssessmentRuleDraft,
  type AssessmentRuleVersion,
  type RoundingMethod,
} from "./assessment-model";
import {
  getAssessmentModels,
  publishAssessmentModel,
  type AssessmentModelsData,
} from "./assessment-models";

const QUERY_KEY = ["academic", "assessment-models"] as const;

/**
 * Modelos de avaliação: a regra em vigor na escola, as versões anteriores e,
 * para o Administrador, publicar uma nova versão (com 2FA).
 */
export function AssessmentModelsTab() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getAssessmentModels() as Promise<AssessmentModelsData>,
    staleTime: 60_000,
  });
  const [editing, setEditing] = useState(false);

  if (query.isLoading) return <InlineLoading label="A carregar modelos de avaliação…" />;
  if (query.isError || !query.data) {
    return (
      <p className="surface-card p-5 text-sm text-muted-foreground">
        Não foi possível carregar os modelos de avaliação.
      </p>
    );
  }

  const { scale, versions, subjects, canPublish } = query.data;
  const active = versions.find((v) => v.status === "active") ?? null;
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-5">
      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Modelo em vigor</p>
            <h2 className="text-base font-medium">
              {active ? active.name : "Sem modelo publicado"}
            </h2>
            {active ? (
              <p className="text-xs text-muted-foreground">
                Versão {active.version} · desde {formatPortalDate(active.createdAt, false)}
                {active.createdByName ? ` · ${active.createdByName}` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Enquanto não houver modelo, as notas usam o Decreto Executivo n.º 424/25 (aprovação
                a 10), mas não é possível gerar pautas oficiais.
              </p>
            )}
          </div>
          {canPublish ? (
            <Button
              size="sm"
              variant={active ? "outline" : "default"}
              onClick={() => setEditing(true)}
            >
              {active ? "Nova versão" : "Publicar modelo"}
            </Button>
          ) : null}
        </div>

        {active ? (
          <RuleSummary
            rule={active}
            decimalPlaces={scale?.decimalPlaces ?? 0}
            subjectName={subjectName}
          />
        ) : null}

        <p className="text-xs text-muted-foreground">
          {scale
            ? `Escala: ${scale.name} (${scale.minimum}–${scale.maximum}).`
            : "A escola não tem escala de notas activa: crie-a na instalação antes de publicar o modelo."}{" "}
          Cada publicação cria uma versão nova; as pautas guardam a versão com que foram geradas.
        </p>
      </section>

      {versions.length > 1 ? (
        <section className="surface-card space-y-3 p-5">
          <h2 className="text-sm font-medium">Versões anteriores</h2>
          <ul className="divide-y divide-border">
            {versions
              .filter((v) => v.status !== "active")
              .map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
                >
                  <span className="text-sm">
                    Versão {v.version} · <span className="text-muted-foreground">{v.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formulaText(v)} · aprovação {v.passingValue} ·{" "}
                    {formatPortalDate(v.createdAt, false)}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {canPublish ? (
        <RuleEditorDialog
          open={editing}
          onOpenChange={setEditing}
          active={active}
          data={query.data}
        />
      ) : null}
    </div>
  );
}

function RuleSummary({
  rule,
  decimalPlaces,
  subjectName,
}: {
  rule: AssessmentRuleVersion;
  decimalPlaces: number;
  subjectName: Map<string, string>;
}) {
  const example = termAverageByRule(12, 9, rule, decimalPlaces);
  const keyNames = rule.keySubjectIds.map((id) => subjectName.get(id) ?? "Disciplina");
  const rows: Array<[string, string]> = [
    ["Fórmula do período", formulaText(rule)],
    ["Aprovação", `${rule.passingValue} valores`],
    [
      "Limite de faltas",
      rule.maximumAbsencePercentage == null ? "—" : `${rule.maximumAbsencePercentage}%`,
    ],
    ["Arredondamento", ROUNDING_LABELS[rule.roundingMethod]],
    ["Alterar nota", rule.gradeChangeRequiresApproval ? "Com aprovação" : "Directo"],
    ["Depois de publicar", rule.lockAfterPublication ? "Pauta bloqueada" : "Editável"],
    [
      "Disciplinas-chave",
      keyNames.length
        ? `${keyNames.join(", ")}${rule.keySubjectsCauseFailure ? " (negativa reprova)" : ""}`
        : "Nenhuma",
    ],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-border/60 pb-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Transição por ciclo</p>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {PROMOTION_CYCLES.map((cycle) => (
            <li key={cycle} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{PROMOTION_CYCLE_LABELS[cycle]}</span>
              <span className="text-right">
                {describePromotionRule((rule.promotionRules ?? DEFAULT_PROMOTION_RULES)[cycle])}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Exemplo: MAC 12 e NPT 9 dão MT {example}.
      </p>
    </div>
  );
}

function RuleEditorDialog({
  open,
  onOpenChange,
  active,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: AssessmentRuleVersion | null;
  data: AssessmentModelsData;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AssessmentRuleDraft>(() => draftFromRule(active));
  const [confirming, setConfirming] = useState(false);
  const current = useMemo(() => (active ? draftFromRule(active) : null), [active]);
  const issues = validateRuleDraft(draft, data.scale);
  const changes = ruleChanges(current, draft);
  const issueFor = (field: keyof AssessmentRuleDraft) =>
    issues.find((i) => i.field === field)?.message;

  const reset = (next: boolean) => {
    if (next) setDraft(draftFromRule(active));
    setConfirming(false);
    onOpenChange(next);
  };

  const mutation = useMutation({
    mutationFn: () =>
      publishAssessmentModel({
        data: { ...draft, maximumAbsencePercentage: draft.maximumAbsencePercentage ?? 0 },
      }),
    onSuccess: (result) => {
      toast.success(`Modelo publicado (versão ${result.version}).`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["academic", "structure-status"] });
      reset(false);
    },
    onError: (error) => toastActionError(error, "Não foi possível publicar o modelo."),
  });

  const set = <K extends keyof AssessmentRuleDraft>(key: K, value: AssessmentRuleDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-medium">
            {active ? `Nova versão (${active.version + 1})` : "Publicar modelo de avaliação"}
          </DialogTitle>
          <DialogDescription>
            A versão em vigor é arquivada. Pautas já geradas mantêm a versão com que foram feitas.
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <div className="space-y-3 text-sm">
            {changes.length ? (
              <>
                <p className="text-muted-foreground">O que muda:</p>
                <ul className="space-y-1.5">
                  {changes.map((c) => (
                    <li key={c.label} className="flex flex-wrap justify-between gap-2">
                      <span>{c.label}</span>
                      <span className="text-muted-foreground">
                        {c.from} → <span className="text-foreground">{c.to}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">
                {current ? "Sem alterações de regra; só uma versão nova." : formulaText(draft)}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Voltar
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "A publicar…" : "Publicar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setDraft((prev) => ({
                    ...DECREE_424_25_MODEL,
                    maximumAbsencePercentage: prev.maximumAbsencePercentage,
                    keySubjectIds: prev.keySubjectIds,
                  }))
                }
              >
                Usar Decreto 424/25
              </Button>
            </div>

            <Field label="Nome" error={issueFor("name")}>
              <Input
                aria-label="Nome"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Peso da avaliação contínua (MAC) %"
                error={issueFor("continuousWeight")}
              >
                <Input
                  aria-label="Peso da avaliação contínua (MAC) %"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.continuousWeight}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setDraft((prev) => ({
                      ...prev,
                      continuousWeight: value,
                      examWeight: Number.isFinite(value) ? 100 - value : prev.examWeight,
                    }));
                  }}
                />
              </Field>
              <Field label="Peso da prova (NPT) %" error={issueFor("examWeight")}>
                <Input
                  aria-label="Peso da prova (NPT) %"
                  type="number"
                  value={draft.examWeight}
                  readOnly
                  className="bg-muted/30"
                />
              </Field>
              <Field label="Nota mínima de aprovação" error={issueFor("passingValue")}>
                <Input
                  aria-label="Nota mínima de aprovação"
                  type="number"
                  step="0.5"
                  value={draft.passingValue}
                  onChange={(e) => set("passingValue", Number(e.target.value))}
                />
              </Field>
              <Field label="Limite de faltas (%)" error={issueFor("maximumAbsencePercentage")}>
                <Input
                  aria-label="Limite de faltas (%)"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.maximumAbsencePercentage ?? ""}
                  placeholder="Definido pela escola"
                  onChange={(e) => set("maximumAbsencePercentage", numberOrNull(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Arredondamento">
              <select
                aria-label="Arredondamento"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.roundingMethod}
                onChange={(e) => set("roundingMethod", e.target.value as RoundingMethod)}
              >
                {ROUNDING_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {ROUNDING_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>

            <div className="space-y-2.5">
              <Toggle
                label="Alterar uma nota lançada exige aprovação"
                checked={draft.gradeChangeRequiresApproval}
                onChange={(v) => set("gradeChangeRequiresApproval", v)}
              />
              <Toggle
                label="Bloquear a pauta depois de publicada"
                checked={draft.lockAfterPublication}
                onChange={(v) => set("lockAfterPublication", v)}
              />
              <Toggle
                label="Negativa numa disciplina-chave reprova"
                checked={draft.keySubjectsCauseFailure}
                onChange={(v) => set("keySubjectsCauseFailure", v)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Transição por ciclo — além da média mínima de aprovação
              </p>
              <div className="space-y-2.5 rounded-md border border-border p-3">
                <div
                  aria-hidden
                  className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[120px_1fr_1fr_auto]"
                >
                  <span>Ciclo</span>
                  <span>Máx. negativas (vazio = sem limite)</span>
                  <span>Admitido a exame com média ≥ (vazio = não)</span>
                  <span className="w-14">PAP</span>
                </div>
                {PROMOTION_CYCLES.map((cycle) => {
                  const rule = draft.promotionRules[cycle];
                  const setRule = (patch: Partial<PromotionCycleRule>) =>
                    setDraft((prev) => ({
                      ...prev,
                      promotionRules: {
                        ...prev.promotionRules,
                        [cycle]: { ...prev.promotionRules[cycle], ...patch },
                      },
                    }));
                  return (
                    <div
                      key={cycle}
                      className="grid items-end gap-2 sm:grid-cols-[120px_1fr_1fr_auto]"
                    >
                      <span className="pb-2 text-sm">{PROMOTION_CYCLE_LABELS[cycle]}</span>
                      <label className="block space-y-1">
                        <span className="block text-xs text-muted-foreground sm:hidden">
                          Máx. negativas (vazio = sem limite)
                        </span>
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          aria-label={`${PROMOTION_CYCLE_LABELS[cycle]}: máximo de negativas`}
                          value={rule.maxFailedSubjects ?? ""}
                          onChange={(e) =>
                            setRule({ maxFailedSubjects: numberOrNull(e.target.value) })
                          }
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="block text-xs text-muted-foreground sm:hidden">
                          Admitido a exame com média ≥ (vazio = não)
                        </span>
                        <Input
                          type="number"
                          step="0.5"
                          aria-label={`${PROMOTION_CYCLE_LABELS[cycle]}: admissão a exame`}
                          value={rule.examAdmissionMinimum ?? ""}
                          onChange={(e) =>
                            setRule({ examAdmissionMinimum: numberOrNull(e.target.value) })
                          }
                        />
                      </label>
                      <label className="flex w-14 items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={rule.requiresPap}
                          onCheckedChange={(v) => setRule({ requiresPap: v })}
                          aria-label={`${PROMOTION_CYCLE_LABELS[cycle]}: PAP obrigatória`}
                        />
                        <span className="sm:hidden">PAP</span>
                      </label>
                    </div>
                  );
                })}
              </div>
              {issueFor("promotionRules") ? (
                <p className="text-xs text-destructive/80">{issueFor("promotionRules")}</p>
              ) : null}
            </div>

            {data.subjects.length ? (
              <div className="space-y-2">
                <p id="key-subjects-label" className="text-xs text-muted-foreground">
                  Disciplinas-chave
                </p>
                <div
                  role="group"
                  aria-labelledby="key-subjects-label"
                  className="grid max-h-44 gap-1.5 overflow-y-auto rounded-md border border-border p-2.5 sm:grid-cols-2"
                >
                  {data.subjects.map((s) => {
                    const checked = draft.keySubjectIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            set(
                              "keySubjectIds",
                              v
                                ? [...draft.keySubjectIds, s.id]
                                : draft.keySubjectIds.filter((id) => id !== s.id),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {formulaText(draft)} · exemplo com MAC 12 e NPT 9:{" "}
              {termAverageByRule(12, 9, draft, data.scale?.decimalPlaces ?? 0)}
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => reset(false)}>
                Cancelar
              </Button>
              <Button disabled={issues.length > 0} onClick={() => setConfirming(true)}>
                Rever e publicar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="block text-xs text-muted-foreground">{label}</span>
        {children}
      </label>
      {error ? <p className="text-xs text-destructive/80">{error}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
