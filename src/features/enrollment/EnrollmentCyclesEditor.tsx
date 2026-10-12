import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCycle, type EnrollmentCycle } from "@/features/students/enrollment-cycle";
import { saveEnrollmentCycles } from "./server";
import { ENROLLMENT_WINDOW_QUERY_KEY, useEnrollmentWindow } from "./use-enrollment-window";

const emptyCycle: EnrollmentCycle = { label: "", opens_on: "", closes_on: "" };

/**
 * Ciclos de matrícula da escola. Fora deles, e sempre durante os períodos de
 * aulas, só a Administração matricula (com motivo). Sem ciclos, as matrículas
 * ficam abertas fora dos períodos de aulas.
 */
export function EnrollmentCyclesEditor() {
  const queryClient = useQueryClient();
  const { status } = useEnrollmentWindow();
  const [rows, setRows] = useState<EnrollmentCycle[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (status) setRows(status.cycles);
  }, [status]);
  if (!status) return null;
  const editable = status.canEditCycles;

  const update = (index: number, patch: Partial<EnrollmentCycle>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    try {
      await saveEnrollmentCycles({ data: { cycles: rows } });
      await queryClient.invalidateQueries({ queryKey: ENROLLMENT_WINDOW_QUERY_KEY });
      toast.success("Ciclos de matrícula guardados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="ciclos-matricula"
      className="space-y-3 rounded-xl border border-border p-3"
    >
      <div>
        <h3 id="ciclos-matricula" className="text-sm font-semibold">
          Ciclos de matrícula
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Matrículas novas só dentro de um ciclo e nunca durante um período de aulas. Sem ciclos,
          ficam abertas fora dos períodos de aulas. Fora do ciclo, só a Administração matricula, com
          motivo registado. Mudar de turma não depende dos ciclos.
        </p>
        <p
          role="status"
          className={`mt-2 text-xs font-medium ${status.open ? "text-success-strong" : "text-foreground"}`}
        >
          {status.message}
        </p>
      </div>

      {status.periods.length ? (
        <p className="text-xs text-muted-foreground">
          Períodos de aulas do ano activo:{" "}
          {status.periods
            .map((period) =>
              formatCycle({
                label: period.name,
                opens_on: period.starts_on,
                closes_on: period.ends_on,
              }),
            )
            .join(" · ")}
        </p>
      ) : null}

      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <label className="text-xs">
              Nome
              <Input
                value={row.label}
                disabled={!editable}
                placeholder="Matrículas 2027/2028"
                onChange={(event) => update(index, { label: event.target.value })}
              />
            </label>
            <label className="text-xs">
              Abre
              <Input
                type="date"
                value={row.opens_on}
                disabled={!editable}
                onChange={(event) => update(index, { opens_on: event.target.value })}
              />
            </label>
            <label className="text-xs">
              Fecha
              <Input
                type="date"
                value={row.closes_on}
                disabled={!editable}
                onChange={(event) => update(index, { closes_on: event.target.value })}
              />
            </label>
            {editable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              >
                Retirar
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((current) => [...current, { ...emptyCycle }])}
          >
            Acrescentar ciclo
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? "A guardar…" : "Guardar ciclos"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Só a Administração altera os ciclos.</p>
      )}
    </section>
  );
}
