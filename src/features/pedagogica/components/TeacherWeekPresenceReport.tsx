import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { exportCsv } from "@/lib/export-csv";
import { addDays } from "@/features/pedagogica/school-qr";
import { getTeacherWeekPresence } from "@/features/pedagogica/school-qr-server";
import {
  TEACHER_WEEK_CSV_COLUMNS,
  type TeacherWeekRow,
} from "@/features/pedagogica/teacher-week-report";

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function rateTone(rate: number | null) {
  if (rate == null) return { bar: "bg-muted", text: "text-muted-foreground" };
  if (rate >= 90) return { bar: "bg-success", text: "text-success-strong" };
  if (rate >= 70) return { bar: "bg-warning", text: "text-warning-strong" };
  return { bar: "bg-destructive", text: "text-destructive-strong" };
}

function Count({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "danger";
}) {
  if (!value && tone !== "neutral") return null;
  const color =
    tone === "danger"
      ? "bg-destructive/10 text-destructive-strong"
      : tone === "warning"
        ? "bg-warning/10 text-warning-strong"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {value} {label}
    </span>
  );
}

function TeacherRow({ row }: { row: TeacherWeekRow }) {
  const tone = rateTone(row.rate);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.teacherName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[
            `${row.confirmed} de ${row.scheduled} ${row.scheduled === 1 ? "aula" : "aulas"}`,
            row.bySelf ? `${row.bySelf} pelo professor` : null,
            row.byDirection ? `${row.byDirection} pela Direcção` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {row.callsWithoutPresence || row.late || row.scansInReview || row.scansRejected ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Count
              label={
                row.callsWithoutPresence === 1 ? "chamada sem presença" : "chamadas sem presença"
              }
              value={row.callsWithoutPresence}
              tone="danger"
            />
            <Count label={row.late === 1 ? "atraso" : "atrasos"} value={row.late} tone="warning" />
            <Count
              label={
                row.scansInReview + row.scansRejected === 1
                  ? "leitura com dúvidas"
                  : "leituras com dúvidas"
              }
              value={row.scansInReview + row.scansRejected}
              tone="warning"
            />
          </div>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 items-center gap-2 sm:w-56">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label={`Presença de ${row.teacherName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={row.rate ?? 0}
        >
          <div className={`h-full ${tone.bar}`} style={{ width: `${row.rate ?? 0}%` }} />
        </div>
        <span
          className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${tone.text}`}
        >
          {row.rate == null ? "—" : `${row.rate}%`}
        </span>
      </div>
    </li>
  );
}

/**
 * Resumo da semana para a Direcção: por professor, aulas do horário já começadas,
 * quantas têm presença, atrasos e chamadas fechadas sem o professor na sala.
 */
export function TeacherWeekPresenceReport() {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const report = useQuery({
    queryKey: ["teacher-week-presence", week ?? "current"],
    queryFn: () => getTeacherWeekPresence({ data: week ? { week } : {} }),
    placeholderData: (previous) => previous,
  });
  const data = report.data;
  // O servidor nunca devolve semanas futuras: a de hoje é a última.
  const isCurrentWeek = !data || data.today <= data.sunday;
  const attention = data?.rows.filter((row) => row.missing || row.callsWithoutPresence) ?? [];

  return (
    <Panel
      title="Resumo da semana"
      description="Aulas do horário já começadas, sem feriados."
      icon={CalendarRange}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Semana anterior"
            disabled={!data}
            onClick={() => data && setWeek(addDays(data.monday, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium tabular-nums">
            {data ? `${shortDate(data.monday)} a ${shortDate(data.sunday)}` : "…"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Semana seguinte"
            disabled={!data || isCurrentWeek}
            onClick={() => data && setWeek(addDays(data.monday, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!data?.rows.length}
            onClick={() =>
              data &&
              exportCsv(`presenca-professores-${data.monday}`, TEACHER_WEEK_CSV_COLUMNS, data.rows)
            }
          >
            <Download className="size-4" /> CSV
          </Button>
        </div>
      }
    >
      {report.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : report.error ? (
        <EmptyState
          title="Não foi possível ler o resumo"
          description={report.error instanceof Error ? report.error.message : "Tente novamente."}
        />
      ) : data && data.rows.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Aulas" value={String(data.totals.scheduled)} />
            <Tile
              label="Com presença"
              value={data.totals.rate == null ? "—" : `${data.totals.rate}%`}
              className={rateTone(data.totals.rate).text}
            />
            <Tile
              label="Professores com faltas"
              value={String(attention.length)}
              className={attention.length ? "text-destructive-strong" : undefined}
            />
            <Tile
              label="Chamadas sem presença"
              value={String(data.totals.callsWithoutPresence)}
              className={data.totals.callsWithoutPresence ? "text-destructive-strong" : undefined}
            />
          </div>
          {data.holidays.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Sem contar o feriado:{" "}
              {data.holidays
                .map((holiday) => `${shortDate(holiday.date)} ${holiday.name}`)
                .join(", ")}
            </p>
          ) : null}
          <ul className="mt-3 divide-y">
            {data.rows.map((row) => (
              <TeacherRow key={row.teacherId} row={row} />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          title="Sem aulas nesta semana"
          description="Ainda não começou nenhuma aula do horário nesta semana, ou o horário não tem professores atribuídos."
        />
      )}
    </Panel>
  );
}

function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${className ?? ""}`}>{value}</p>
    </div>
  );
}
