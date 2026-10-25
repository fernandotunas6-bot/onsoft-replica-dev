import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Coffee, MapPin, UserRound, Users } from "lucide-react";
import { InlineLoading } from "@/components/ui/inline-loading";
import { todayInLuanda } from "@/features/calendar/dates";
import { subjectHues } from "@/features/calendar/subject-tone";
import { weekdayJsFromIso } from "@/features/dashboard/school-today";
import {
  getMyStudentTimetable,
  type StudentTimetable,
  type StudentTimetableLesson,
} from "@/features/dashboard/student-agenda";
import { getMyTeacherTimetable } from "@/features/academic/timetable-lessons";
import { LessonDetailDialog } from "@/features/dashboard/components/LessonDetailDialog";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** Um intervalo só se assinala a partir deste vazio entre aulas. */
const BREAK_MINUTES = 15;

function nowInLuandaHhMm() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Horário semanal: da turma do aluno (ou do educando) ou, para o professor,
 * das suas aulas em todas as turmas. Cada disciplina tem a sua cor; hoje e a aula
 * em curso ficam marcados e cada aula abre o detalhe (tema, modo, professor,
 * tarefas). Em ecrãs pequenos mostra um dia de cada vez, com selector de dias.
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
  const [pickedWeekday, setPickedWeekday] = useState<number | null>(null);
  const timetable = query.data;
  const todayWeekday = weekdayJsFromIso(todayInLuanda());
  const now = nowInLuandaHhMm();
  const days = useMemo(() => timetable?.days ?? [], [timetable]);
  const hues = useMemo(
    () => subjectHues(days.flatMap((day) => day.lessons.map((lesson) => lesson.subjectName))),
    [days],
  );
  const lessonCount = days.reduce((total, day) => total + day.lessons.length, 0);
  // Em ecrã pequeno: o dia escolhido; senão hoje; senão o próximo dia com aulas.
  const shownWeekday =
    pickedWeekday ??
    days.find((day) => day.weekday === todayWeekday)?.weekday ??
    days.find((day) => day.weekday > todayWeekday)?.weekday ??
    days[0]?.weekday;

  return (
    <section className="surface-card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-strong"
            aria-hidden
          >
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">
              {teacher ? "O meu horário" : "Horário da semana"}
              {timetable?.className ? (
                <span className="font-normal text-muted-foreground"> · {timetable.className}</span>
              ) : null}
            </h2>
            {lessonCount ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lessonCount} {lessonCount === 1 ? "aula" : "aulas"} esta semana
              </p>
            ) : null}
          </div>
        </div>
        {timetable?.publishedAt ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
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
        <>
          <div
            className="grid gap-1 rounded-xl bg-muted/70 p-1 lg:hidden"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            role="group"
            aria-label="Escolher o dia"
          >
            {days.map((day) => {
              const active = day.weekday === shownWeekday;
              const isToday = day.weekday === todayWeekday;
              return (
                <button
                  key={day.weekday}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${WEEKDAY_LABELS[day.weekday]}${isToday ? " (hoje)" : ""}: ${day.lessons.length} aulas`}
                  onClick={() => setPickedWeekday(day.weekday)}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center rounded-lg px-1 py-1.5 text-xs transition-[background-color,color,box-shadow] duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-1">
                    {WEEKDAY_SHORT[day.weekday]}
                    {isToday ? (
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                    ) : null}
                  </span>
                  <span className="text-[11px] font-normal tabular-nums opacity-80">
                    {day.lessons.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="grid gap-3 lg:[grid-template-columns:repeat(var(--days),minmax(0,1fr))]"
            style={{ "--days": days.length } as CSSProperties}
          >
            {days.map((day) => {
              const isToday = day.weekday === todayWeekday;
              return (
                <div
                  key={day.weekday}
                  data-today={isToday || undefined}
                  className={cn(
                    "min-w-0 space-y-2 lg:rounded-xl lg:border lg:p-2.5",
                    isToday ? "lg:border-primary/30 lg:bg-primary-soft/25" : "lg:border-border",
                    day.weekday === shownWeekday ? "block" : "hidden lg:block",
                  )}
                >
                  <p className="hidden items-center justify-between px-0.5 text-xs font-semibold text-foreground lg:flex">
                    <span>{WEEKDAY_LABELS[day.weekday]}</span>
                    {isToday ? (
                      <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                        Hoje
                      </span>
                    ) : null}
                  </p>
                  <ul className="space-y-1.5">
                    {day.lessons.map((lesson, index) => {
                      const previous = day.lessons[index - 1];
                      const gap = previous
                        ? minutes(lesson.startsAt) - minutes(previous.endsAt)
                        : 0;
                      return (
                        <li key={`${lesson.startsAt}-${index}`} className="space-y-1.5">
                          {gap >= BREAK_MINUTES ? (
                            <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                              <Coffee className="size-3" aria-hidden />
                              Intervalo · {previous!.endsAt}–{lesson.startsAt}
                            </p>
                          ) : null}
                          <LessonChip
                            lesson={lesson}
                            teacher={teacher}
                            hue={hues.get(lesson.subjectName)}
                            current={isToday && lesson.startsAt <= now && now < lesson.endsAt}
                            past={isToday && lesson.endsAt <= now}
                            onOpen={setOpenSlotId}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
      <LessonDetailDialog
        slotId={openSlotId}
        studentId={teacher ? null : (studentId ?? null)}
        onOpenChange={(open) => !open && setOpenSlotId(null)}
      />
    </section>
  );
}

function LessonChip({
  lesson,
  teacher,
  hue,
  current,
  past,
  onOpen,
}: {
  lesson: StudentTimetableLesson;
  teacher: boolean;
  hue: number | undefined;
  current: boolean;
  past: boolean;
  onOpen: (slotId: string) => void;
}) {
  const who = teacher ? lesson.className : lesson.teacherName;
  const WhoIcon = teacher ? Users : UserRound;
  return (
    <button
      type="button"
      disabled={!lesson.slotId}
      onClick={() => lesson.slotId && onOpen(lesson.slotId)}
      aria-label={`${lesson.subjectName}, ${lesson.startsAt} às ${lesson.endsAt}: ver detalhes`}
      aria-current={current ? "time" : undefined}
      style={{ "--tone-h": hue } as CSSProperties}
      className={cn(
        "subject-tone group relative block w-full overflow-hidden rounded-lg py-2 pl-3.5 pr-2.5 text-left",
        "bg-[var(--tone-bg)] transition-[background-color,opacity,box-shadow] duration-150 enabled:hover:bg-[var(--tone-bg-hover)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        current && "shadow-sm ring-2 ring-[var(--tone-accent)]",
        past && "opacity-60",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-[var(--tone-accent)]" aria-hidden />
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium tabular-nums text-[var(--tone-fg)]">
        <span>
          {lesson.startsAt}–{lesson.endsAt}
        </span>
        {current ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--tone-fg)] px-1.5 py-px text-[10px] font-semibold text-[var(--tone-bg)]">
            <span
              className="size-1.5 rounded-full bg-[var(--tone-bg)] motion-safe:animate-pulse"
              aria-hidden
            />
            Agora
          </span>
        ) : null}
      </span>
      <span className="mt-0.5 block text-sm font-semibold leading-snug text-foreground">
        {lesson.subjectName}
      </span>
      {who || lesson.room ? (
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] leading-tight text-muted-foreground">
          {who ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <WhoIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{who}</span>
            </span>
          ) : null}
          {lesson.room ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{roomLabel(lesson.room)}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

/** "3" → "Sala 3"; nomes que já dizem o que são ("Sala 3", "Laboratório") ficam. */
function roomLabel(room: string) {
  return /^\d+[A-Za-z]?$/.test(room.trim()) ? `Sala ${room.trim()}` : room.trim();
}
