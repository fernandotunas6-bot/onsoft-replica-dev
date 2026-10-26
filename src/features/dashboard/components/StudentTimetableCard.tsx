import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Coffee,
  MapPin,
  PartyPopper,
  Printer,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/inline-loading";
import { downloadTextFile } from "@/features/academic/schedule/utils/exporters";
import { angolaHolidaysBetween } from "@/features/calendar/angola-holidays";
import { addDaysIso, todayInLuanda } from "@/features/calendar/dates";
import { subjectHues } from "@/features/calendar/subject-tone";
import { weekdayJsFromIso } from "@/features/dashboard/school-today";
import {
  getMyStudentTimetable,
  type StudentTimetable,
  type StudentTimetableLesson,
} from "@/features/dashboard/student-agenda";
import {
  lessonDate,
  nextLessonInfo,
  nextLessonText,
  printableTimetableHtml,
  weekIcs,
  weekLabel,
  weekMonday,
} from "@/features/dashboard/timetable-week";
import { getMyTeacherTimetable } from "@/features/academic/timetable-lessons";
import { LessonDetailDialog } from "@/features/dashboard/components/LessonDetailDialog";
import { toast } from "@/lib/toast";
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
 * Navega entre semanas, assinala feriados, destaca uma disciplina, exporta a semana
 * para o calendário do telemóvel e imprime.
 */
export function StudentTimetableCard({
  studentId,
  variant = "student",
}: {
  studentId?: string | null;
  variant?: "student" | "teacher";
}) {
  const teacher = variant === "teacher";
  const today = todayInLuanda();
  const thisMonday = weekMonday(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = addDaysIso(thisMonday, weekOffset * 7);
  const isThisWeek = weekOffset === 0;
  const query = useQuery({
    queryKey: teacher
      ? ["dashboard", "teacher-timetable", weekStart]
      : ["dashboard", "student-timetable", studentId ?? "self", weekStart],
    queryFn: () =>
      (teacher
        ? isThisWeek
          ? getMyTeacherTimetable()
          : getMyTeacherTimetable({ data: { weekStart } })
        : getMyStudentTimetable({
            data: {
              ...(studentId ? { studentId } : {}),
              ...(isThisWeek ? {} : { weekStart }),
            },
          })) as Promise<StudentTimetable>,
    staleTime: 10 * 60 * 1000,
    // Ao mudar de semana mantém a anterior até chegar a nova: sem piscar.
    placeholderData: (previous) => previous,
  });
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [pickedWeekday, setPickedWeekday] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const timetable = query.data;
  const todayWeekday = isThisWeek ? weekdayJsFromIso(today) : -1;
  const now = nowInLuandaHhMm();
  const days = useMemo(() => timetable?.days ?? [], [timetable]);
  const hues = useMemo(
    () => subjectHues(days.flatMap((day) => day.lessons.map((lesson) => lesson.subjectName))),
    [days],
  );
  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const day of days)
      for (const lesson of day.lessons)
        counts.set(lesson.subjectName, (counts.get(lesson.subjectName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt"));
  }, [days]);
  const holidays = useMemo(
    () =>
      angolaHolidaysBetween(weekStart, addDaysIso(weekStart, 6)).filter(
        (holiday) => new Date(`${holiday.date}T12:00:00Z`).getUTCDay() !== 0,
      ),
    [weekStart],
  );
  const lessonCount = days.reduce((total, day) => total + day.lessons.length, 0);
  const next = isThisWeek ? nextLessonInfo(days, weekdayJsFromIso(today), now) : null;
  // Em ecrã pequeno: o dia escolhido; senão hoje; senão o próximo dia com aulas.
  const shownWeekday =
    (pickedWeekday !== null && days.some((day) => day.weekday === pickedWeekday)
      ? pickedWeekday
      : null) ??
    days.find((day) => day.weekday === todayWeekday)?.weekday ??
    days.find((day) => todayWeekday >= 0 && day.weekday > todayWeekday)?.weekday ??
    days[0]?.weekday;
  const title = teacher ? "O meu horário" : "Horário da semana";
  const fullTitle = timetable?.className ? `${title} · ${timetable.className}` : title;

  const goToWeek = (offset: number) => {
    setWeekOffset(offset);
    setPickedWeekday(null);
  };
  const exportWeek = () => {
    if (!timetable) return;
    downloadTextFile(
      `horario-semana-${weekStart}.ics`,
      weekIcs(timetable, weekStart, fullTitle),
      "text/calendar;charset=utf-8",
    );
  };
  const printWeek = () => {
    if (!timetable) return;
    const html = printableTimetableHtml(timetable, { title: fullTitle, weekStart, teacher });
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("O navegador bloqueou a janela de impressão. Permita janelas para este site.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const showWeekTools = query.isSuccess && (days.length > 0 || !isThisWeek);

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
              {title}
              {timetable?.className ? (
                <span className="font-normal text-muted-foreground"> · {timetable.className}</span>
              ) : null}
            </h2>
            {lessonCount || !isThisWeek ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isThisWeek
                  ? `${lessonCount} ${lessonCount === 1 ? "aula" : "aulas"} esta semana`
                  : `${lessonCount} ${lessonCount === 1 ? "aula" : "aulas"} · semana de ${weekLabel(weekStart)}`}
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

      {showWeekTools ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Mudar de semana">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Semana anterior"
              onClick={() => goToWeek(weekOffset - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-28 text-center text-xs font-medium tabular-nums">
              {weekLabel(weekStart)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Semana seguinte"
              onClick={() => goToWeek(weekOffset + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            {!isThisWeek ? (
              <Button type="button" variant="outline" size="sm" onClick={() => goToWeek(0)}>
                Esta semana
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={lessonCount === 0}
              onClick={exportWeek}
            >
              <CalendarPlus className="size-3.5" aria-hidden /> Calendário
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={lessonCount === 0}
              onClick={printWeek}
            >
              <Printer className="size-3.5" aria-hidden /> Imprimir
            </Button>
          </div>
        </div>
      ) : null}

      {next ? (
        <p
          className="subject-tone rounded-lg bg-[var(--tone-bg)] px-3 py-2 text-xs font-medium text-[var(--tone-fg)]"
          style={{ "--tone-h": hues.get(next.lesson.subjectName) } as CSSProperties}
          role="status"
        >
          {nextLessonText(next, weekdayJsFromIso(today))}
        </p>
      ) : null}

      {holidays.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Feriados desta semana">
          {holidays.map((holiday) => (
            <li
              key={holiday.date}
              className="inline-flex items-center gap-1.5 rounded-full bg-destructive/8 px-2.5 py-1 text-[11px] text-destructive"
            >
              <PartyPopper className="size-3" aria-hidden />
              {WEEKDAY_LABELS[new Date(`${holiday.date}T12:00:00Z`).getUTCDay()]}{" "}
              {Number(holiday.date.slice(8, 10))}: {holiday.name} — sem aulas
            </li>
          ))}
        </ul>
      ) : null}

      {query.isLoading ? (
        <InlineLoading label="A carregar horário…" />
      ) : query.isError ? (
        <p className="text-xs text-muted-foreground">Não foi possível carregar o horário.</p>
      ) : days.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {!isThisWeek
            ? "Sem aulas publicadas nesta semana."
            : teacher
              ? "Ainda não há aulas suas no horário."
              : "O horário da turma ainda não foi publicado pela escola."}
        </p>
      ) : (
        <>
          {legend.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Destacar disciplina">
              {legend.map(([subject, count]) => {
                const active = highlighted === subject;
                return (
                  <button
                    key={subject}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setHighlighted(active ? null : subject)}
                    style={{ "--tone-h": hues.get(subject) } as CSSProperties}
                    className={cn(
                      "subject-tone inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-[var(--tone-accent)] bg-[var(--tone-bg)] font-semibold text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="size-2 rounded-full bg-[var(--tone-accent)]" aria-hidden />
                    {subject}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

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
                    <span>
                      {WEEKDAY_LABELS[day.weekday]}{" "}
                      <span className="font-normal text-muted-foreground">
                        {Number(lessonDate(weekStart, day.weekday).slice(8, 10))}
                      </span>
                    </span>
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
                            dimmed={highlighted !== null && highlighted !== lesson.subjectName}
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
  dimmed,
  onOpen,
}: {
  lesson: StudentTimetableLesson;
  teacher: boolean;
  hue: number | undefined;
  current: boolean;
  past: boolean;
  dimmed: boolean;
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
        dimmed && "opacity-30",
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
