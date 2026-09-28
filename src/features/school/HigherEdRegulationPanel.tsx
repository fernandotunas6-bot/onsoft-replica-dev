import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_HIGHER_ED_REGULATION,
  REGULATION_PRESETS,
  applyRegulationPreset,
  describeHigherEdRegulation,
  fromDisplayGrade,
  higherEdRegulationSchema,
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

/** Campos numéricos por grupo; `optional` aceita vazio (= sem esta regra). */
const GROUPS: Array<{
  title: string;
  fields: Array<{ key: FieldKey; label: string; hint: string; optional?: boolean }>;
}> = [
  {
    title: "Avaliação",
    fields: [
      { key: "passingGrade", label: "Aprovação", hint: "{nota}" },
      {
        key: "continuousWeight",
        label: "Peso da frequência",
        hint: "% · o exame fica com o resto",
      },
      {
        key: "exemptionGrade",
        label: "Dispensa de exame",
        hint: "{nota} · vazio: sem dispensa",
        optional: true,
      },
      { key: "examAdmissionGrade", label: "Admissão a exame", hint: "{nota} · 0: todos vão" },
      {
        key: "minimumExamGrade",
        label: "Nota mínima no exame",
        hint: "{nota} · vazio: sem mínimo",
        optional: true,
      },
      { key: "maxAbsencePercentage", label: "Faltas máximas", hint: "% das aulas" },
    ],
  },
  {
    title: "Créditos e percurso",
    fields: [
      { key: "creditsPerYear", label: "Créditos por ano", hint: "{creditos}" },
      { key: "maxCreditsPerYear", label: "Máximo por ano", hint: "com cadeiras em atraso" },
      { key: "progressionPercentage", label: "Para transitar", hint: "% · 0: sem retenção" },
      {
        key: "maxAttemptsPerUnit",
        label: "Inscrições por cadeira",
        hint: "vazio: sem limite",
        optional: true,
      },
      {
        key: "appealMaxUnits",
        label: "Cadeiras em recurso",
        hint: "por semestre · vazio: sem limite",
        optional: true,
      },
    ],
  },
];
const NUMBER_FIELDS = GROUPS.flatMap((group) => group.fields);

const SWITCHES: Array<{ key: BooleanKey; label: string }> = [
  { key: "appealSeason", label: "Época de recurso" },
  { key: "specialSeason", label: "Época especial" },
  { key: "gradeImprovement", label: "Melhoria de nota" },
  { key: "enforcePrerequisites", label: "Precedências obrigatórias" },
  { key: "showEctsGrade", label: "Mostrar nota ECTS (A–F)" },
  { key: "showGpa", label: "Mostrar equivalente GPA 0–4" },
];

type Draft = Record<FieldKey, string> & Omit<HigherEdRegulation, FieldKey>;

function toDraft(reg: HigherEdRegulation): Draft {
  const draft = { ...reg } as unknown as Record<string, unknown>;
  for (const field of NUMBER_FIELDS) {
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
  for (const field of NUMBER_FIELDS) {
    const text = draft[field.key].trim().replace(",", ".");
    if (text === "" && !field.optional) return { ok: false, message: `Indique: ${field.label}.` };
    const value = text === "" ? null : Number(text);
    if (value != null && !Number.isFinite(value)) {
      return { ok: false, message: `${field.label}: use só números.` };
    }
    if (value != null && GRADE_KEYS.has(field.key) && value > draft.displayScale) {
      return { ok: false, message: `${field.label}: a escala vai até ${draft.displayScale}.` };
    }
    raw[field.key] =
      value != null && GRADE_KEYS.has(field.key)
        ? fromDisplayGrade(draft as unknown as HigherEdRegulation, value)
        : value;
  }
  const parsed = higherEdRegulationSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const field = NUMBER_FIELDS.find((item) => item.key === issue?.path[0]);
  // As regras cruzadas trazem mensagem própria; os limites simples não.
  return {
    ok: false,
    message:
      issue?.code === "custom"
        ? issue.message
        : `${field?.label ?? "Valor"}: fora dos limites permitidos.`,
  };
}

/** O regulamento difere do modelo de onde partiu? */
function adjustedFromPreset(reg: HigherEdRegulation) {
  if (reg.presetId === "personalizado") return false;
  const base = applyRegulationPreset(reg.presetId);
  return (Object.keys(base) as Array<keyof HigherEdRegulation>).some(
    (key) => base[key] !== reg[key],
  );
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
  options: Array<{ id: T; label: string }>;
  disabled: boolean;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-full text-xs text-muted-foreground sm:w-auto">{label}</span>
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
 * Regulamento académico da instituição de ensino superior: parte de um modelo
 * nacional ou internacional e ajusta-se campo a campo.
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
  const error = parsed.ok ? null : parsed.message;
  const summary = parsed.ok ? describeHigherEdRegulation(parsed.data) : [];
  const adjusted = parsed.ok && adjustedFromPreset(parsed.data);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const changeScale = (scale: HigherEdRegulation["displayScale"]) => {
    // As notas mantêm o valor; só muda a forma de as escrever.
    if (parsed.ok) setDraft(toDraft({ ...parsed.data, displayScale: scale }));
    else set("displayScale", scale);
  };

  const save = async () => {
    if (!parsed.ok) return;
    setSaving(true);
    try {
      await saveRegulation({ data: parsed.data });
      await queryClient.invalidateQueries({ queryKey: ["school", "higher-ed-regulation"] });
      toast.success("Regulamento académico guardado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const hint = (text: string) =>
    text
      .replace("{nota}", draft.displayScale === 100 ? "%" : `0–${draft.displayScale}`)
      .replace("{creditos}", draft.creditLabel);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Modelo de referência</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(REGULATION_PRESETS) as Array<keyof typeof REGULATION_PRESETS>).map((id) => {
            const preset = REGULATION_PRESETS[id];
            const active = draft.presetId === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!canEdit}
                onClick={() => setDraft(toDraft(applyRegulationPreset(id)))}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "hover:bg-muted/60",
                )}
              >
                <span className="block text-sm">
                  {preset.label}
                  {active && adjusted ? (
                    <span className="text-xs text-muted-foreground"> · ajustado</span>
                  ) : null}
                </span>
                <span className="block text-xs text-muted-foreground">{preset.detail}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Os modelos trazem os valores mais comuns em cada sistema. Não substituem o regulamento
          aprovado da instituição: confirme e ajuste abaixo.
        </p>
      </div>

      <div className="space-y-2">
        <Chips
          label="Escala de notas"
          value={draft.displayScale}
          disabled={!canEdit}
          onChange={changeScale}
          options={[
            { id: 20, label: "0–20 valores" },
            { id: 10, label: "0–10 pontos" },
            { id: 100, label: "0–100%" },
          ]}
        />
        <Chips
          label="Unidade de crédito"
          value={draft.creditLabel}
          disabled={!canEdit}
          onChange={(id) => set("creditLabel", id)}
          options={[
            { id: "créditos", label: "Créditos" },
            { id: "ECTS", label: "ECTS" },
            { id: "UC", label: "Unidades de crédito (UC)" },
          ]}
        />
        <Chips
          label="Classificação final"
          value={draft.finalMentions}
          disabled={!canEdit}
          onChange={(id) => set("finalMentions", id)}
          options={[
            { id: "qualitativa", label: "Suficiente a Excelente" },
            { id: "latinas", label: "Honras latinas (GPA)" },
            { id: "nenhuma", label: "Só a média" },
          ]}
        />
        <Chips
          label="Nota final"
          value={draft.finalGradeDecimals}
          disabled={!canEdit}
          onChange={(id) => set("finalGradeDecimals", id)}
          options={[
            { id: 0, label: "Inteira" },
            { id: 1, label: "Uma casa decimal" },
          ]}
        />
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-xs text-muted-foreground">{group.title}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {group.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`reg-${field.key}`} className="text-xs">
                  {field.label}
                </Label>
                <Input
                  id={`reg-${field.key}`}
                  inputMode="decimal"
                  value={draft[field.key]}
                  disabled={!canEdit}
                  placeholder={field.optional ? "—" : undefined}
                  onChange={(event) => set(field.key, event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">{hint(field.hint)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="grid gap-2 sm:grid-cols-2">
        {SWITCHES.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
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

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <ul className="grid gap-1 rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex justify-end gap-2">
          {parsed.ok && parsed.data.presetId !== "personalizado" && adjusted ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                parsed.ok &&
                parsed.data.presetId !== "personalizado" &&
                setDraft(toDraft(applyRegulationPreset(parsed.data.presetId)))
              }
            >
              Repor o modelo
            </Button>
          ) : null}
          <Button type="button" onClick={save} disabled={saving || !parsed.ok}>
            {saving ? "A guardar…" : "Guardar regulamento"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
