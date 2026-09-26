import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { InlineLoading } from "@/components/ui/inline-loading";
import { todayInLuanda } from "@/features/calendar/dates";
import { weekdayJsFromIso } from "@/features/dashboard/school-today";
import { getMyStudentTimetable, type StudentTimetable } from "@/features/dashboard/student-agenda";
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
 * Horário semanal da turma do aluno (ou do educando seleccionado): uma coluna
 * por dia com aulas, hoje destacado e a aula em curso marcada.
 */
export function StudentTimetableCard({ studentId }: { studentId?: string | null }) {
  const query = useQuery({
    queryKey: ["dashboard", "student-timetable", studentId ?? "self"],
    queryFn: () =>
      getMyStudentTimetable({ data: studentId ? { studentId } : {} }) as Promise<StudentTimetable>,
    staleTime: 10 * 60 * 1000,
  });
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
            Horário da semana
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
          O horário da turma ainda não foi publicado pela escola.
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
                    return (
                      <li
                        key={`${lesson.startsAt}-${index}`}
                        className={cn(
                          "rounded-lg px-2 py-1.5",
                          current
                            ? "bg-primary-soft text-primary-strong ring-1 ring-primary/30"
                            : "bg-muted/60",
                        )}
                      >
                        <p className="flex items-center justify-between gap-2 whitespace-nowrap text-xs tabular-nums opacity-80">
                          <span>
                            {lesson.startsAt}–{lesson.endsAt}
                          </span>
                          {current ? <span>Agora</span> : null}
                        </p>
                        <p className="text-sm font-medium leading-tight">{lesson.subjectName}</p>
                        {lesson.teacherName || lesson.room ? (
                          <p className="text-xs opacity-75 leading-tight">
                            {[lesson.teacherName, lesson.room ? roomLabel(lesson.room) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** "3" → "Sala 3"; nomes que já dizem o que são ("Sala 3", "Laboratório") ficam. */
function roomLabel(room: string) {
  return /^\d+[A-Za-z]?$/.test(room.trim()) ? `Sala ${room.trim()}` : room.trim();
}
