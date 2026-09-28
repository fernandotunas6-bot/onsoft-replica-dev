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
  describeHigherEdRegulation,
  higherEdRegulationSchema,
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

/** Campos numéricos; `optional` aceita vazio (= sem esta regra). */
const NUMBER_FIELDS: Array<{
  key: Exclude<NumberKey, "finalGradeDecimals">;
  label: string;
  hint: string;
  optional?: boolean;
  step?: number;
}> = [
  { key: "passingGrade", label: "Aprovação", hint: "valores", step: 0.5 },
  { key: "continuousWeight", label: "Peso da frequência", hint: "% (o exame fica com o resto)" },
  {
    key: "exemptionGrade",
    label: "Dispensa de exame",
    hint: "valores · vazio: sem dispensa",
    optional: true,
    step: 0.5,
  },
  { key: "examAdmissionGrade", label: "Admissão a exame", hint: "valores", step: 0.5 },
  { key: "maxAbsencePercentage", label: "Faltas máximas", hint: "% das aulas" },
  {
    key: "minimumExamGrade",
    label: "Nota mínima no exame",
    hint: "valores · vazio: sem mínimo",
    optional: true,
    step: 0.5,
  },
  { key: "creditsPerYear", label: "Créditos por ano", hint: "ECTS" },
  { key: "maxCreditsPerYear", label: "Máximo por ano", hint: "ECTS, com cadeiras em atraso" },
  { key: "progressionPercentage", label: "Para transitar", hint: "% dos créditos do ano" },
  {
    key: "appealMaxUnits",
    label: "Cadeiras em recurso",
    hint: "por semestre · vazio: sem limite",
    optional: true,
  },
];

const SWITCHES: Array<{ key: BooleanKey; label: string }> = [
  { key: "appealSeason", label: "Época de recurso" },
  { key: "specialSeason", label: "Época especial" },
  { key: "gradeImprovement", label: "Exame de melhoria de nota" },
  { key: "enforcePrerequisites", label: "Precedências obrigatórias" },
];

type Draft = Record<Exclude<NumberKey, "finalGradeDecimals">, string> &
  Pick<HigherEdRegulation, BooleanKey | "finalGradeDecimals">;

function toDraft(reg: HigherEdRegulation): Draft {
  const draft = { ...reg } as unknown as Draft;
  for (const field of NUMBER_FIELDS) {
    const value = reg[field.key];
    (draft as Record<string, unknown>)[field.key] = value == null ? "" : String(value);
  }
  return draft;
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
    raw[field.key] = value;
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

/**
 * Regulamento académico da instituição de ensino superior: as regras que o
 * motor usa para aprovar, dispensar, excluir e fazer transitar por créditos.
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {NUMBER_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`reg-${field.key}`} className="text-xs text-muted-foreground">
              {field.label}
            </Label>
            <Input
              id={`reg-${field.key}`}
              inputMode="decimal"
              value={draft[field.key]}
              disabled={!canEdit}
              placeholder={field.optional ? "—" : undefined}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
            <p className="text-[11px] text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {SWITCHES.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
          >
            <Switch
              checked={draft[item.key]}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, [item.key]: checked }))
              }
            />
            <span className="text-sm">{item.label}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Nota final</span>
        {([0, 1] as const).map((decimals) => (
          <button
            key={decimals}
            type="button"
            disabled={!canEdit}
            onClick={() => setDraft((current) => ({ ...current, finalGradeDecimals: decimals }))}
            className={cn(
              "rounded-full border px-3 py-1 transition-colors",
              draft.finalGradeDecimals === decimals
                ? "border-primary bg-primary/5"
                : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {decimals ? "Uma casa decimal" : "Inteira"}
          </button>
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
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft(toDraft(DEFAULT_HIGHER_ED_REGULATION))}
          >
            Repor sugestão
          </Button>
          <Button type="button" onClick={save} disabled={saving || !parsed.ok}>
            {saving ? "A guardar…" : "Guardar regulamento"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
