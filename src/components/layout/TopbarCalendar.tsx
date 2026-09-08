import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckSquare, Clock3, PieChart, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import {
  listCalendarEvents,
  listDayAgendaLessons,
  type CalendarEventSummary,
} from "@/features/calendar/server";
import { todayInLuanda } from "@/features/calendar/dates";
import { takeUpcomingDayLessons, type DayAgendaLesson } from "@/features/calendar/day-lessons";
import { buildUpcomingCalendarItems, upcomingItemHint } from "@/features/calendar/upcoming";
import { nowTimeInLuanda } from "@/features/dashboard/school-today";
import { agendaLessonActions } from "@/features/hr/teacher-classroom-links";
import { cn } from "@/lib/utils";

function formatTopbarDate(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatItemDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * Mini-agenda na topbar: aulas de hoje (horário) + períodos/feriados próximos.
 * Cada aula oferece atalhos de chamada e QR de presença quando o perfil tem acesso.
 */
export function TopbarCalendar() {
  const [open, setOpen] = useState(false);
  const currentUser = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const canOpen = canAccessPath("/calendario", currentUser.role);
  const canCall = canAccessPath("/pedagogica", currentUser.role, currentUser.grants);
  const canQr = canAccessPath("/professor/presenca", currentUser.role, currentUser.grants);
  const today = todayInLuanda();
  const nowHhMm = nowTimeInLuanda();

  const eventsQuery = useQuery({
    queryKey: ["calendar", "events", "topbar", selectedYearId],
    queryFn: () =>
      listCalendarEvents({
        data: {
          limit: 40,
          academicYearId: selectedYearId ?? undefined,
          includePast: Boolean(selectedYearId),
        },
      }) as Promise<CalendarEventSummary[]>,
    enabled: open && canOpen,
    retry: false,
    staleTime: 60_000,
  });

  const lessonsQuery = useQuery({
    queryKey: ["calendar", "day-lessons", "topbar", today],
    queryFn: () =>
      listDayAgendaLessons({ data: { date: today, limit: 16 } }) as Promise<DayAgendaLesson[]>,
    enabled: open && canOpen,
    retry: false,
    staleTime: 60_000,
  });

  const items = buildUpcomingCalendarItems(
    (eventsQuery.data ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      event_date: event.event_date,
      ends_on: event.ends_on,
    })),
    today,
    4,
  );

  const lessons = takeUpcomingDayLessons(lessonsQuery.data ?? [], nowHhMm, 4);
  const loading = eventsQuery.isLoading || lessonsQuery.isLoading;
  const empty = lessons.length === 0 && items.length === 0;

  if (!canOpen) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="header-icon-btn gap-1.5 px-2"
          aria-label="Agenda do dia e calendário escolar"
          title="Agenda escolar"
        >
          <CalendarDays className="size-5" />
          <span className="hidden text-xs font-medium capitalize xl:inline">
            {formatTopbarDate(today)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agenda escolar
          </p>
          <p className="mt-0.5 text-sm font-semibold capitalize">{formatTopbarDate(today)}</p>
        </div>
        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">A carregar agenda…</p>
          ) : empty ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Sem aulas, períodos ou feriados próximos neste dia.
            </p>
          ) : (
            <div className="space-y-3">
              {lessons.length > 0 ? (
                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Aulas de hoje
                  </p>
                  <ul className="space-y-1">
                    {lessons.map((lesson) => {
                      const actions = agendaLessonActions({ ...lesson, date: today });
                      return (
                        <li
                          key={lesson.id}
                          className="rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex w-12 shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
                              <Clock3 className="size-3" aria-hidden />
                              {lesson.startsAt}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {lesson.subjectName}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                {lesson.classGroupName}
                                {lesson.room ? ` · Sala ${lesson.room}` : ""}
                              </span>
                            </span>
                          </div>
                          {actions && (canCall || canQr) ? (
                            <div className="mt-1.5 flex flex-wrap gap-1 pl-14">
                              {canCall ? (
                                <Button asChild size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px]">
                                  <Link
                                    to="/pedagogica"
                                    search={actions.callSearch}
                                    onClick={() => setOpen(false)}
                                  >
                                    <CheckSquare className="size-3" /> Chamada
                                  </Link>
                                </Button>
                              ) : null}
                              {canCall ? (
                                <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
                                  <Link
                                    to="/pedagogica"
                                    search={actions.gradesSearch}
                                    onClick={() => setOpen(false)}
                                  >
                                    <PieChart className="size-3" /> Pauta
                                  </Link>
                                </Button>
                              ) : null}
                              {canQr ? (
                                <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
                                  <Link
                                    to="/professor/presenca"
                                    search={actions.qrSearch}
                                    onClick={() => setOpen(false)}
                                  >
                                    <QrCode className="size-3" /> QR
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {items.length > 0 ? (
                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Períodos e feriados
                  </p>
                  <ul className="space-y-1">
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link
                          to="/calendario"
                          search={{ dia: item.event_date }}
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                        >
                          <span className="mt-0.5 w-12 shrink-0 text-[11px] font-medium text-muted-foreground">
                            {formatItemDate(item.event_date)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.title}</span>
                            <span
                              className={cn(
                                "mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-semibold",
                                item.category === "holiday"
                                  ? "bg-destructive/12 text-destructive"
                                  : "bg-primary-soft text-primary-strong",
                              )}
                            >
                              {upcomingItemHint(item, today)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="border-t border-border/70 p-2">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/calendario" onClick={() => setOpen(false)}>
              Abrir calendário completo
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
