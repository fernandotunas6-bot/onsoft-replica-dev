import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StudentStatusBadge } from "./StudentStatusBadge";
import { StudentFinanceBadge } from "./StudentFinanceBadge";

export type StudentMobileRecord = {
  id: string;
  registration_number: string;
  full_name: string;
  student_status: string;
  payment_status: string | null;
  grade_name: string | null;
  class_name: string | null;
  academic_year: string | null;
  primary_guardian_name: string | null;
  email: string | null;
  phone: string | null;
  debt_amount?: number;
  overdue_count?: number;
};

/** Mesmos registos, selecção e ficha da tabela; resumo sem scroll lateral. */
export function StudentMobileList<T extends StudentMobileRecord>({
  students,
  selectedIds,
  onSelect,
  onView,
  renderAvatar,
}: {
  students: T[];
  selectedIds: string[];
  onSelect: (id: string, selected: boolean) => void;
  onView: (student: T) => void;
  renderAvatar?: (student: T) => ReactNode;
}) {
  return (
    <ul className="grid min-w-0 gap-3 md:hidden print:hidden" aria-label="Lista de alunos">
      {students.map((student) => (
        <li
          key={student.id}
          className={cn(
            "min-w-0 rounded-xl border border-border bg-card p-3.5 shadow-card",
            selectedIds.includes(student.id) && "border-primary/50 bg-primary/5",
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-muted">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                aria-label={`Seleccionar ${student.full_name}`}
                checked={selectedIds.includes(student.id)}
                onChange={(event) => onSelect(student.id, event.target.checked)}
              />
            </label>
            <button
              type="button"
              onClick={() => onView(student)}
              aria-label={`Visualizar ${student.full_name}`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md text-left"
            >
              {renderAvatar?.(student)}
              <span className="min-w-0 flex-1">
                <span className="block [overflow-wrap:anywhere] text-sm font-semibold">
                  {student.full_name}
                </span>
                <span className="block break-all text-xs tabular-nums text-muted-foreground">
                  Nº {student.registration_number}
                </span>
              </span>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-start gap-1.5">
            <StudentStatusBadge status={student.student_status} size="sm" />
            <StudentFinanceBadge
              status={student.payment_status}
              debtAmount={student.debt_amount}
              overdueCount={student.overdue_count}
              size="sm"
              className="max-w-full [&>span:last-child]:[overflow-wrap:anywhere]"
            />
          </div>
          <dl className="mt-3 grid min-w-0 gap-2 text-xs">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Classe e turma</dt>
              <dd className="[overflow-wrap:anywhere] font-medium">
                {student.grade_name ?? "Sem classe"} · {student.class_name ?? "Sem turma"}
              </dd>
            </div>
            {student.academic_year ? (
              <div>
                <dt className="text-muted-foreground">Ano lectivo</dt>
                <dd className="[overflow-wrap:anywhere]">{student.academic_year}</dd>
              </div>
            ) : null}
            {student.primary_guardian_name ? (
              <div>
                <dt className="text-muted-foreground">Encarregado</dt>
                <dd className="[overflow-wrap:anywhere]">{student.primary_guardian_name}</dd>
              </div>
            ) : null}
            {student.phone || student.email ? (
              <div>
                <dt className="text-muted-foreground">Contacto</dt>
                <dd className="[overflow-wrap:anywhere]">
                  {student.phone ? <span className="block">{student.phone}</span> : null}
                  {student.email ? <span className="block">{student.email}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => onView(student)}>
              <Eye aria-hidden="true" /> Visualizar
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/alunos/$studentId" params={{ studentId: student.id }}>
                <FileText aria-hidden="true" /> Ficha completa
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
