import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CREDIT_LABEL_SUGGESTIONS,
  DEFAULT_HIGHER_ED_REGULATION,
  EDUCATION_COUNTRIES,
  REGULATION_PRESETS,
  applyRegulationPreset,
  describeHigherEdRegulation,
  fromDisplayGrade,
  higherEdRegulationSchema,
  regulationForCountry,
  toDisplayGrade,
  type HigherEdRegulation,
} from "@/features/academic/higher-ed-regulation";
import { getHigherEdRegulation, updateHigherEdRegulation } from "@/features/school/server";
import { cn } from "@/lib/utils";

type NumberKey = {
  [K in keyof HigherEdRegulation]: HigherEdRegulation[K] extends number | null ? K : never;
}[keyof HigherEdRegulation];
type BooleanKey = {
  [K in keyof HigherEdRegulation]: HigherEdRegulation[K] extends boolean ? K : never;
}[keyof HigherEdRegulation];
type FieldKey = Exclude<NumberKey, "finalGradeDecimals" | "displayScale">;

/** Notas: mostram-se e lançam-se na escala escolhida; guardam-se em 0–20. */
const GRADE_KEYS = new Set<FieldKey>([
  "passingGrade",
  "exemptionGrade",
  "examAdmissionGrade",
  "minimumExamGrade",
]);

const FIELDS: Array<{ key: FieldKey; label: string; optional?: boolean; suffix?: string }> = [
  { key: "passingGrade", label: "Aprovação" },
  { key: "continuousWeight", label: "Peso da frequência", suffix: "%" },
  { key: "exemptionGrade", label: "Dispensa de exame", optional: true },
  { key: "examAdmissionGrade", label: "Admissão a exame" },
  { key: "minimumExamGrade", label: "Mínimo no exame", optional: true },
  { key: "maxAbsencePercentage", label: "Faltas máximas", suffix: "%" },
  { key: "creditsPerYear", label: "Créditos por ano" },
  { key: "maxCreditsPerYear", label: "Máximo por ano" },
  { key: "progressionPercentage", label: "Para transitar", suffix: "%" },
  { key: "maxAttemptsPerUnit", label: "Inscrições por cadeira", optional: true },
  { key: "appealMaxUnits", label: "Cadeiras em recurso", optional: true },
];

const SWITCHES: Array<{ key: BooleanKey; label: string }> = [
  { key: "appealSeason", label: "Época de recurso" },
  { key: "specialSeason", label: "Época especial" },
  { key: "gradeImprovement", label: "Melhoria de nota" },
  { key: "enforcePrerequisites", label: "Precedências obrigatórias" },
  { key: "showEctsGrade", label: "Nota ECTS" },
  { key: "showGpa", label: "Equivalente GPA" },
];

/** Escalas de notas: números ou letras (as letras usam limites em %). */
const SCALES = [
  { id: "20", label: "0–20" },
  { id: "10", label: "0–10" },
  { id: "100", label: "0–100" },
  { id: "a_f", label: "A–F" },
  { id: "a_f_mais_menos", label: "A+ … F" },
] as const;
type ScaleId = (typeof SCALES)[number]["id"];

const scaleOf = (reg: Pick<HigherEdRegulation, "displayScale" | "letterGrades">): ScaleId =>
  reg.letterGrades !== "nenhuma" ? reg.letterGrades : (String(reg.displayScale) as ScaleId);

type Draft = Record<FieldKey, string> & Omit<HigherEdRegulation, FieldKey>;

function toDraft(reg: HigherEdRegulation): Draft {
  const draft = { ...reg } as unknown as Record<string, unknown>;
  for (const field of FIELDS) {
    const value = reg[field.key];
    draft[field.key] =
      value == null ? "" : String(GRADE_KEYS.has(field.key) ? toDisplayGrade(reg, value) : value);
  }
  return draft as Draft;
}

function fromDraft(
  draft: Draft,
): { ok: true; data: HigherEdRegulation } | { ok: false; message: string } {
  const raw: Record<string, unknown> = { ...draft };
  for (const field of FIELDS) {
    const text = draft[field.key].trim().replace(",", ".");
    if (text === "" && !field.optional) return { ok: false, message: `Indique: ${field.label}.` };
    const value = text === "" ? null : Number(text);
    if (value != null && !Number.isFinite(value)) {
      return { ok: false, message: `${field.label}: só números.` };
    }
    if (value != null && GRADE_KEYS.has(field.key) && value > draft.displayScale) {
      return { ok: false, message: `${field.label}: máximo ${draft.displayScale}.` };
    }
    raw[field.key] =
      value != null && GRADE_KEYS.has(field.key)
        ? fromDisplayGrade(draft as unknown as HigherEdRegulation, value)
        : value;
  }
  const parsed = higherEdRegulationSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const field = FIELDS.find((item) => item.key === issue?.path[0]);
  return {
    ok: false,
    message:
      issue?.code === "custom" ? issue.message : `${field?.label ?? "Valor"}: fora dos limites.`,
  };
}

function Chips<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  disabled: boolean;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-full text-xs text-muted-foreground sm:w-40">{label}</span>
      {options.map((option) => (
        <button
          key={String(option.id)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-full border px-3 py-1 transition-colors",
            value === option.id
              ? "border-primary bg-primary/5"
              : "text-muted-foreground hover:bg-muted/60",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Regulamento académico do ensino superior. Parte do país do sistema de
 * ensino e ajusta-se campo a campo; o resto é para quem precisar.
 */
export function HigherEdRegulationPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const fetchRegulation = useServerFn(getHigherEdRegulation);
  const saveRegulation = useServerFn(updateHigherEdRegulation);
  const query = useQuery({
    queryKey: ["school", "higher-ed-regulation"],
    queryFn: () => fetchRegulation() as Promise<HigherEdRegulation>,
    staleTime: 5 * 60_000,
  });
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_HIGHER_ED_REGULATION));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(toDraft(query.data));
  }, [query.data]);

  const parsed = fromDraft(draft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /** Muda a forma de escrever as notas sem mudar o seu valor. */
  const changeScale = (id: ScaleId) => {
    const letters = id === "a_f" || id === "a_f_mais_menos";
    const next = {
      letterGrades: letters ? id : ("nenhuma" as const),
      displayScale: letters ? 100 : (Number(id) as 20 | 10 | 100),
    };
    if (parsed.ok) setDraft(toDraft({ ...parsed.data, ...next }));
    else setDraft((current) => ({ ...current, ...next }));
  };

  const save = async () => {
    if (!parsed.ok) return;
    setSaving(true);
    try {
      await saveRegulation({ data: parsed.data });
      await queryClient.invalidateQueries({ queryKey: ["school", "higher-ed-regulation"] });
      toast.success("Regulamento guardado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const gradeSuffix =
    draft.letterGrades !== "nenhuma" || draft.displayScale === 100 ? "%" : `/${draft.displayScale}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reg-country" className="text-xs">
            País do sistema de ensino
          </Label>
          <select
            id="reg-country"
            disabled={!canEdit}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={draft.country}
            onChange={(event) => setDraft(toDraft(regulationForCountry(event.target.value)))}
          >
            {EDUCATION_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-model" className="text-xs">
            Modelo
          </Label>
          <select
            id="reg-model"
            disabled={!canEdit}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={draft.presetId === "personalizado" ? "" : draft.presetId}
            onChange={(event) => {
              const id = event.target.value as keyof typeof REGULATION_PRESETS;
              if (id) setDraft(toDraft(applyRegulationPreset(id, draft.country)));
            }}
          >
            {(Object.keys(REGULATION_PRESETS) as Array<keyof typeof REGULATION_PRESETS>).map(
              (id) => (
                <option key={id} value={id}>
                  {REGULATION_PRESETS[id].label}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Chips
          label="Notas"
          value={scaleOf(draft)}
          options={SCALES}
          disabled={!canEdit}
          onChange={changeScale}
        />
        <Chips
          label="Classificação final"
          value={draft.finalMentions}
          disabled={!canEdit}
          onChange={(id) => set("finalMentions", id)}
          options={[
            { id: "qualitativa", label: "Suficiente…Excelente" },
            { id: "latinas", label: "Cum laude" },
            { id: "britanica", label: "First, 2:1, 2:2" },
            { id: "nenhuma", label: "Só a média" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Label
            htmlFor="reg-credit-label"
            className="w-full text-xs text-muted-foreground sm:w-40"
          >
            Nome dos créditos
          </Label>
          <Input
            id="reg-credit-label"
            list="reg-credit-labels"
            className="h-8 w-40"
            maxLength={24}
            disabled={!canEdit}
            value={draft.creditLabel}
            onChange={(event) => set("creditLabel", event.target.value)}
          />
          <datalist id="reg-credit-labels">
            {CREDIT_LABEL_SUGGESTIONS.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`reg-${field.key}`} className="text-xs">
              {field.label}
            </Label>
            <div className="relative">
              <Input
                id={`reg-${field.key}`}
                inputMode="decimal"
                value={draft[field.key]}
                disabled={!canEdit}
                placeholder={field.optional ? "—" : undefined}
                className="pr-10"
                onChange={(event) => set(field.key, event.target.value)}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                {GRADE_KEYS.has(field.key)
                  ? gradeSuffix
                  : field.key === "creditsPerYear" || field.key === "maxCreditsPerYear"
                    ? ""
                    : field.suffix}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SWITCHES.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2"
          >
            <Switch
              checked={draft[item.key]}
              disabled={!canEdit}
              onCheckedChange={(checked) => set(item.key, checked)}
            />
            <span className="text-sm">{item.label}</span>
          </label>
        ))}
      </div>

      {parsed.ok ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {describeHigherEdRegulation(parsed.data).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {parsed.message}
        </p>
      )}

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={saving || !parsed.ok}>
            {saving ? "A guardar…" : "Guardar"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
