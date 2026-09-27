import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { InlineLoading } from "@/components/ui/inline-loading";
import { todayInLuanda } from "@/features/calendar/dates";
import { weekdayJsFromIso } from "@/features/dashboard/school-today";
import { getMyStudentTimetable, type StudentTimetable } from "@/features/dashboard/student-agenda";
import { getMyTeacherTimetable } from "@/features/academic/timetable-lessons";
import { LessonDetailDialog } from "@/features/dashboard/components/LessonDetailDialog";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function nowInLuandaHhMm() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/**
 * Horário semanal: da turma do aluno (ou do educando) ou, para o professor,
 * das suas aulas em todas as turmas. Uma coluna por dia, hoje destacado, aula
 * em curso marcada; cada aula abre o detalhe (tema, modo, professor, tarefas).
 */
export function StudentTimetableCard({
  studentId,
  variant = "student",
}: {
  studentId?: string | null;
  variant?: "student" | "teacher";
}) {
  const teacher = variant === "teacher";
  const query = useQuery({
    queryKey: teacher
      ? ["dashboard", "teacher-timetable"]
      : ["dashboard", "student-timetable", studentId ?? "self"],
    queryFn: () =>
      (teacher
        ? getMyTeacherTimetable()
        : getMyStudentTimetable({
            data: studentId ? { studentId } : {},
          })) as Promise<StudentTimetable>,
    staleTime: 10 * 60 * 1000,
  });
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const timetable = query.data;
  const todayWeekday = weekdayJsFromIso(todayInLuanda());
  const now = nowInLuandaHhMm();
  const days = timetable?.days ?? [];

  return (
    <section className="surface-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-medium">
            {teacher ? "O meu horário" : "Horário da semana"}
            {timetable?.className ? (
              <span className="text-muted-foreground"> · {timetable.className}</span>
            ) : null}
          </h2>
        </div>
        {timetable?.publishedAt ? (
          <span className="text-xs text-muted-foreground">
            Publicado a {new Date(timetable.publishedAt).toLocaleDateString("pt-PT")}
          </span>
        ) : null}
      </div>

      {query.isLoading ? (
        <InlineLoading label="A carregar horário…" />
      ) : query.isError ? (
        <p className="text-xs text-muted-foreground">Não foi possível carregar o horário.</p>
      ) : days.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {teacher
            ? "Ainda não há aulas suas no horário."
            : "O horário da turma ainda não foi publicado pela escola."}
        </p>
      ) : (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--days),minmax(0,1fr))]"
          style={{ "--days": days.length } as CSSProperties}
        >
          {days.map((day) => {
            const isToday = day.weekday === todayWeekday;
            return (
              <div
                key={day.weekday}
                data-today={isToday || undefined}
                className={cn(
                  "rounded-xl border p-3 space-y-2",
                  isToday ? "border-primary/30 bg-primary-soft/30" : "border-border",
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  {WEEKDAY_LABELS[day.weekday]}
                  {isToday ? <span className="ml-1.5 text-primary">· Hoje</span> : null}
                </p>
                <ul className="space-y-1.5">
                  {day.lessons.map((lesson, index) => {
                    const current = isToday && lesson.startsAt <= now && now < lesson.endsAt;
                    const meta = [
                      teacher ? lesson.className : lesson.teacherName,
                      lesson.room ? roomLabel(lesson.room) : null,
                    ].filter(Boolean);
                    return (
                      <li key={`${lesson.startsAt}-${index}`}>
                        <button
                          type="button"
                          disabled={!lesson.slotId}
                          onClick={() => lesson.slotId && setOpenSlotId(lesson.slotId)}
                          aria-label={`${lesson.subjectName}, ${lesson.startsAt} às ${lesson.endsAt}: ver detalhes`}
                          className={cn(
                            "block w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            current
                              ? "bg-primary-soft text-primary-strong ring-1 ring-primary/30"
                              : "bg-muted/60 enabled:hover:bg-muted",
                          )}
                        >
                          <p className="flex items-center justify-between gap-2 whitespace-nowrap text-xs tabular-nums opacity-80">
                            <span>
                              {lesson.startsAt}–{lesson.endsAt}
                            </span>
                            {current ? <span>Agora</span> : null}
                          </p>
                          <p className="text-sm font-medium leading-tight">{lesson.subjectName}</p>
                          {meta.length ? (
                            <p className="text-xs opacity-75 leading-tight">{meta.join(" · ")}</p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <LessonDetailDialog
        slotId={openSlotId}
        studentId={teacher ? null : (studentId ?? null)}
        onOpenChange={(open) => !open && setOpenSlotId(null)}
      />
    </section>
  );
}

/** "3" → "Sala 3"; nomes que já dizem o que são ("Sala 3", "Laboratório") ficam. */
function roomLabel(room: string) {
  return /^\d+[A-Za-z]?$/.test(room.trim()) ? `Sala ${room.trim()}` : room.trim();
}
