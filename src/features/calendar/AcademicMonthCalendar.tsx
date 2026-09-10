import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AngolaHoliday } from "./angola-holidays";
import { holidayOn } from "./angola-holidays";
import {
  addDaysIso,
  addMonthsYm,
  daysInMonth,
  isoDate,
  isoInInclusiveRange,
  monthsCovered,
  parseIsoDate,
  todayInLuanda,
  weekdayMonday0,
} from "./dates";

type TermSpan = {
  id: string;
  title: string;
  event_date: string;
  ends_on: string;
  sequence: number;
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

const TERM_TONES = [
  "bg-primary/18 text-primary-strong",
  "bg-info/16 text-info-strong",
  "bg-warning/25 text-warning-foreground",
  "bg-success/18 text-success",
] as const;

function termToneClass(sequence: number) {
  const index = Math.max(0, (sequence || 1) - 1) % TERM_TONES.length;
  return TERM_TONES[index];
}

function termsOnDay(events: TermSpan[], day: string) {
  return events.filter((event) => isoInInclusiveRange(day, event.event_date, event.ends_on));
}

function monthLabel(yearMonth: string) {
  const parsed = parseIsoDate(`${yearMonth}-01`);
  if (!parsed) return yearMonth;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, 1)).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AcademicMonthCalendar({
  events,
  holidays,
  yearMonth,
  selectedDay,
  onYearMonthChange,
  onSelectDay,
}: {
  events: TermSpan[];
  holidays: AngolaHoliday[];
  yearMonth: string;
  selectedDay: string | null;
  onYearMonthChange: (next: string) => void;
  onSelectDay: (day: string) => void;
}) {
  const today = todayInLuanda();
  const parsed = parseIsoDate(`${yearMonth}-01`) ?? { year: 2026, month: 1, day: 1 };
  const totalDays = daysInMonth(parsed.year, parsed.month);
  const pad = weekdayMonday0(isoDate(parsed.year, parsed.month, 1));
  const cells: Array<{ day: string } | null> = [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => ({
      day: isoDate(parsed.year, parsed.month, index + 1),
    })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const spanFrom = events.reduce(
    (min, event) => (event.event_date < min ? event.event_date : min),
    events[0]?.event_date ?? `${yearMonth}-01`,
  );
  const spanTo = events.reduce(
    (max, event) => {
      const end = event.ends_on || event.event_date;
      return end > max ? end : max;
    },
    events[0]?.ends_on ?? `${yearMonth}-01`,
  );
  const yearMonths = monthsCovered(
    spanFrom < `${yearMonth}-01` ? spanFrom : `${yearMonth}-01`,
    spanTo > `${yearMonth}-28` ? spanTo : `${yearMonth}-28`,
  );

  const shiftSelected = (delta: number) => {
    const origin = selectedDay ?? today;
    const shifted = addDaysIso(origin, delta);
    onSelectDay(shifted);
    const nextYm = shifted.slice(0, 7);
    if (nextYm !== yearMonth) onYearMonthChange(nextYm);
  };

  return (
    <div
      className="space-y-4"
      tabIndex={0}
      role="grid"
      aria-label="Calendário mensal"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          shiftSelected(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          shiftSelected(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          shiftSelected(-7);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          shiftSelected(7);
        }
      }}
    >
      {yearMonths.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {yearMonths.map((month) => {
            const active = month === yearMonth;
            const covers = events.some((event) => {
              const start = event.event_date.slice(0, 7);
              const end = (event.ends_on || event.event_date).slice(0, 7);
              return month >= start && month <= end;
            });
            const holidayHere = holidays.some((holiday) => holiday.date.slice(0, 7) === month);
            return (
              <button
                key={month}
                type="button"
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-semibold capitalize",
                  active
                    ? "bg-primary text-primary-foreground"
                    : covers
                      ? "bg-primary/12 text-primary-strong hover:bg-primary/18"
                      : "text-muted-foreground hover:bg-muted",
                )}
                onClick={() => {
                  onYearMonthChange(month);
                  onSelectDay(`${month}-01`);
                }}
              >
                {monthLabel(month).replace(/\s+\d{4}$/, "")}
                {holidayHere && !active ? (
                  <span className="ml-1 inline-block size-1 rounded-full bg-destructive align-middle" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-base font-semibold capitalize">{monthLabel(yearMonth)}</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Mês anterior"
            onClick={() => onYearMonthChange(addMonthsYm(yearMonth, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const now = todayInLuanda();
              onYearMonthChange(now.slice(0, 7));
              onSelectDay(now);
            }}
          >
            Hoje
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Mês seguinte"
            onClick={() => onYearMonthChange(addMonthsYm(yearMonth, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((label, index) => (
          <div key={label} className={cn("py-1", index >= 5 && "text-destructive/70")}>
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} className="min-h-16 rounded-md bg-muted/30" />;
          }
          const covering = termsOnDay(events, cell.day);
          const holiday = holidayOn(cell.day, holidays);
          const primary = covering[0];
          const isToday = cell.day === today;
          const isSelected = cell.day === selectedDay;
          const isWeekend = weekdayMonday0(cell.day) >= 5;
          return (
            <button
              key={cell.day}
              type="button"
              onClick={() => onSelectDay(cell.day)}
              aria-pressed={isSelected}
              aria-label={`${cell.day}${holiday ? `, ${holiday.name}` : ""}${primary ? `, ${primary.title}` : ""}`}
              className={cn(
                "min-h-16 rounded-md border px-1.5 py-1.5 text-left transition-colors",
                "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                primary ? termToneClass(primary.sequence) : "border-border bg-card",
                holiday && !primary
                  ? "border-destructive/40 bg-destructive/8"
                  : "border-transparent",
                isWeekend && !primary && !holiday && "bg-muted/40",
                isToday && "ring-2 ring-primary/80 font-semibold",
                isSelected && "border-primary ring-2 ring-primary",
              )}
            >
              <span className="flex items-start justify-between gap-1">
                <span className={cn("text-xs font-semibold", isWeekend && "text-muted-foreground")}>
                  {Number(cell.day.slice(8))}
                </span>
                <span className="flex items-center gap-0.5">
                  {covering.length > 1 ? (
                    <span className="text-[9px] font-semibold opacity-80">
                      +{covering.length - 1}
                    </span>
                  ) : null}
                  {holiday ? (
                    <span
                      className="mt-0.5 size-1.5 shrink-0 rounded-full bg-destructive"
                      aria-hidden
                    />
                  ) : null}
                </span>
              </span>
              {primary ? (
                <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-tight">
                  {primary.title}
                </span>
              ) : holiday ? (
                <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-tight text-destructive">
                  {holiday.name}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {events.length ? (
        <ul className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 hover:underline"
                onClick={() => {
                  onYearMonthChange(event.event_date.slice(0, 7));
                  onSelectDay(event.event_date);
                }}
              >
                <span className={cn("size-2.5 rounded-sm", termToneClass(event.sequence))} />
                {event.title}
              </button>
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive" />
            Feriado nacional
          </li>
        </ul>
      ) : null}
    </div>
  );
}

export function initialCalendarMonth(events: TermSpan[], today = todayInLuanda()) {
  const ym = today.slice(0, 7);
  const coversToday = events.some((event) =>
    isoInInclusiveRange(today, event.event_date, event.ends_on),
  );
  if (coversToday || events.some((event) => event.event_date.slice(0, 7) === ym)) return ym;
  const first = events[0]?.event_date;
  return (first ?? today).slice(0, 7);
}
