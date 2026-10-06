import { useMemo, useState } from "react";
import { Download, FileDown, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { exportCsv } from "@/lib/export-csv";
import { exportPdfTable } from "@/lib/export-pdf-loader";
import {
  getPeriodCountForCycle,
  getPeriodLabel,
  getPeriodsForCycle,
  inferTeachingCycle,
} from "@/lib/angola-academic";
import { buildPautaExportRows, type PautaGradeInput } from "./pauta-export";
import type { PromotionRules } from "./assessment-model";

type Props = {
  termGrades: ReadonlyArray<PautaGradeInput>;
  classGroups: ReadonlyArray<{
    id: string;
    name: string;
    /** Classe e curso da turma: derivam o ciclo, e o ciclo decide regime e transição. */
    grade_name?: string;
    course_name?: string;
  }>;
  /** `schools.evaluation_periods` — 2 ou 3; o Ensino Superior ignora-a (é semestral). */
  evaluationPeriods?: number | undefined;
  /** Nota mínima do modelo em vigor (`usePassingValue`). */
  passing?: number | undefined;
  /** Regras de transição do modelo em vigor (`useActiveAssessmentRule`). */
  promotionRules?: PromotionRules | undefined;
  disabled?: boolean;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PautaExportDialog({
  termGrades,
  classGroups,
  evaluationPeriods,
  passing,
  promotionRules,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(classGroups[0]?.id ?? "");
  const [period, setPeriod] = useState<string>("1");
  const [picked, setPicked] = useState<Set<string> | null>(null);

  const classGrades = useMemo(
    () => termGrades.filter((g) => g.class_group_id === (classId || classGroups[0]?.id)),
    [termGrades, classId, classGroups],
  );
  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of classGrades) map.set(g.subject_id, g.subject_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt"));
  }, [classGrades]);
  const selected = picked ?? new Set(subjects.map(([id]) => id));
  const effectiveClass = classId || classGroups[0]?.id || "";
  const group = classGroups.find((c) => c.id === effectiveClass);
  const className = group?.name ?? "Turma";
  // O regime é da turma, não da escola: numa escola com Superior e Secundário, um só
  // número não servia os dois (getPeriodCountForCycle trata o Superior como semestral).
  const cycle = inferTeachingCycle(group?.grade_name, group?.course_name);
  const periodCount = getPeriodCountForCycle(cycle, evaluationPeriods);
  const periods = getPeriodsForCycle(cycle, evaluationPeriods);
  // Uma turma de 2 períodos não deve oferecer o 3.º: ficava uma pauta vazia.
  const safePeriod = period !== "anual" && Number(period) > periodCount ? "anual" : period;
  const periodNumber = safePeriod === "anual" ? "anual" : Number(safePeriod);
  const periodLabel = safePeriod === "anual" ? "Anual" : getPeriodLabel(cycle, Number(safePeriod));

  const build = () => {
    const chosen = subjects.filter(([id]) => selected.has(id));
    if (chosen.length === 0) {
      toast.error("Seleccione pelo menos uma disciplina.");
      return null;
    }
    const rows = buildPautaExportRows(
      classGrades,
      chosen.map(([id]) => id),
      periodNumber,
      { periodCount, cycle, passing, promotionRules },
    );
    if (rows.length === 0) {
      toast.error("Não há notas para esta turma e período.");
      return null;
    }
    return { rows, chosen };
  };

  const fileBase = `pauta-${className}-${periodLabel}`.toLowerCase().replace(/[^a-z0-9]+/gi, "-");

  const columns = (chosen: Array<[string, string]>) => [
    { label: "Nº", value: (r: ReturnType<typeof buildPautaExportRows>[number]) => r.number },
    {
      label: "Aluno",
      value: (r: ReturnType<typeof buildPautaExportRows>[number]) => r.student_name,
    },
    ...chosen.map(([id, name]) => ({
      label: name,
      value: (r: ReturnType<typeof buildPautaExportRows>[number]) =>
        r.scores[id] == null ? "—" : r.scores[id]!.toFixed(1),
    })),
    {
      label: "Média",
      value: (r: ReturnType<typeof buildPautaExportRows>[number]) =>
        r.average == null ? "—" : r.average.toFixed(1),
    },
    {
      label: "Situação",
      value: (r: ReturnType<typeof buildPautaExportRows>[number]) => r.situation,
    },
  ];

  const onCsv = () => {
    const built = build();
    if (!built) return;
    exportCsv(`${fileBase}.csv`, columns(built.chosen), built.rows);
    toast.success("Pauta exportada em CSV.");
    setOpen(false);
  };
  const onPdf = async () => {
    const built = build();
    if (!built) return;
    await exportPdfTable(
      `${fileBase}.pdf`,
      `Pauta — ${className}`,
      columns(built.chosen),
      built.rows,
      `${periodLabel} · ${built.chosen.length} disciplina(s)`,
    );
    toast.success("Pauta exportada em PDF.");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={disabled || classGroups.length === 0}>
          <Sheet className="size-4" /> Exportar pauta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar pauta</DialogTitle>
          <DialogDescription>Escolha a turma, o período e as disciplinas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pauta-turma">Turma</Label>
              <select
                id="pauta-turma"
                className={selectClass}
                value={effectiveClass}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setPicked(null);
                }}
              >
                {classGroups.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pauta-periodo">Período</Label>
              <select
                id="pauta-periodo"
                className={selectClass}
                value={safePeriod}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {periods.map((p) => (
                  <option key={p} value={String(p)}>
                    {getPeriodLabel(cycle, p)}
                  </option>
                ))}
                <option value="anual">Anual (média final)</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Disciplinas</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() =>
                  setPicked(
                    selected.size === subjects.length
                      ? new Set()
                      : new Set(subjects.map(([id]) => id)),
                  )
                }
              >
                {selected.size === subjects.length ? "Limpar" : "Todas"}
              </button>
            </div>
            {subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Esta turma ainda não tem notas.</p>
            ) : (
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
                {subjects.map(([id, name]) => (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.has(id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(id);
                        else next.delete(id);
                        setPicked(next);
                      }}
                    />
                    {name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="gap-2" onClick={onCsv}>
            <Download className="size-4" /> CSV
          </Button>
          <Button className="gap-2" onClick={() => void onPdf()}>
            <FileDown className="size-4" /> PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
