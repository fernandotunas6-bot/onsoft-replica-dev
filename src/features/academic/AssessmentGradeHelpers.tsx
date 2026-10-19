import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rowsToTsv } from "@/features/academic/assessment-views";
import { formatScore } from "@/lib/angola-academic";

/** Peças da grelha de lançamento: barra de notas em lote e detalhe do aluno. */

export type BatchField = "mac" | "npp" | "npt";

type CopyRow = {
  student: { student_name: string; registration_number?: string | null };
  mac: number | null;
  npp: number | null;
  npt: number | null;
  average: number | null;
};

export function AssessmentBatchBar({
  selectedRows,
  field,
  onFieldChange,
  value,
  onValueChange,
  onApply,
}: {
  selectedRows: ReadonlyArray<CopyRow>;
  field: BatchField;
  onFieldChange: (field: BatchField) => void;
  value: string;
  onValueChange: (value: string) => void;
  onApply: () => void;
}) {
  const copyRows = () => {
    const text = rowsToTsv([
      ["Aluno", "Proc.", "MAC", "NPP", "NPT", "Média"],
      ...selectedRows.map((row) => [
        row.student.student_name,
        row.student.registration_number,
        row.mac,
        row.npp,
        row.npt,
        row.average,
      ]),
    ]);
    void navigator.clipboard.writeText(text);
    toast.success("Linhas copiadas para o Excel");
  };

  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        {selectedRows.length} seleccionado(s)
      </p>
      <select
        aria-label="Campo a aplicar em lote"
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        value={field}
        onChange={(event) => onFieldChange(event.target.value as BatchField)}
      >
        <option value="mac">MAC</option>
        <option value="npp">NPP</option>
        <option value="npt">NPT</option>
      </select>
      <Input
        aria-label="Nota a aplicar em lote"
        className="h-9 w-24"
        inputMode="decimal"
        placeholder="0–20"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <Button size="sm" onClick={onApply}>
        Aplicar aos seleccionados
      </Button>
      <Button size="sm" variant="outline" onClick={copyRows}>
        Copiar
      </Button>
    </div>
  );
}

export function AssessmentStudentDetail({
  studentName,
  items,
  row,
  average,
}: {
  studentName: string;
  items: ReadonlyArray<{ id: unknown; name: unknown; component: unknown }>;
  row: Record<string, string>;
  average: number | null;
}) {
  return (
    <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
      <p className="font-semibold">{studentName} · detalhe MAC/NPP/NPT</p>
      {(["MAC", "NPP", "NPT"] as const).map((component) => {
        const componentItems = items.filter((item) => item.component === component);
        return (
          <div key={component} className="mt-2">
            <p className="text-xs font-bold text-muted-foreground">{component}</p>
            {componentItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem avaliações neste componente.</p>
            ) : (
              componentItems.map((item) => (
                <p key={String(item.id)} className="text-xs">
                  {String(item.name)} ………… {row[String(item.id)] || "—"}
                </p>
              ))
            )}
          </div>
        );
      })}
      <p className="mt-2 font-bold">Média ………… {formatScore(average)}</p>
    </div>
  );
}
