/**
 * Semana do horário nos portais: datas, próxima aula, exportação da semana (.ics) e
 * página de impressão. Puro e sem rede: o cartão chama-o com o que já recebeu.
 */
import { addDaysIso, weekdayMonday0 } from "@/features/calendar/dates";
import { toIcsTimedCalendar } from "@/features/calendar/ics";
import type { StudentTimetable, StudentTimetableLesson } from "./student-agenda";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function weekMonday(day: string) {
  return addDaysIso(day, -weekdayMonday0(day));
}

/** Data de um dia da semana (0 = domingo, à JS) na semana que começa em `weekStart`. */
export function lessonDate(weekStart: string, weekday: number) {
  return addDaysIso(weekStart, weekday === 0 ? 6 : weekday - 1);
}

function shortDate(iso: string) {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""}`;
}

/** «26 out – 1 nov» (segunda a domingo). */
export function weekLabel(weekStart: string) {
  return `${shortDate(weekStart)} – ${shortDate(addDaysIso(weekStart, 6))}`;
}

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type NextLesson = {
  lesson: StudentTimetableLesson;
  weekday: number;
  /** Aula a decorrer agora. */
  current: boolean;
  /** Minutos até começar (hoje), ou null noutro dia. */
  startsIn: number | null;
};

/** A aula a decorrer ou a próxima desta semana, a partir de hoje e da hora actual. */
export function nextLessonInfo(
  days: StudentTimetable["days"],
  todayWeekday: number,
  now: string,
): NextLesson | null {
  const order = (weekday: number) => (weekday === 0 ? 7 : weekday);
  const today = order(todayWeekday);
  const sorted = [...days].sort((a, b) => order(a.weekday) - order(b.weekday));
  for (const day of sorted) {
    if (order(day.weekday) < today) continue;
    for (const lesson of day.lessons) {
      if (order(day.weekday) === today) {
        if (lesson.endsAt <= now) continue;
        const current = lesson.startsAt <= now;
        return {
          lesson,
          weekday: day.weekday,
          current,
          startsIn: current ? 0 : minutes(lesson.startsAt) - minutes(now),
        };
      }
      return { lesson, weekday: day.weekday, current: false, startsIn: null };
    }
  }
  return null;
}

export function nextLessonText(next: NextLesson, todayWeekday: number) {
  const { lesson } = next;
  const where = lesson.room ? ` · ${lesson.room}` : "";
  if (next.current) return `Agora: ${lesson.subjectName} até às ${lesson.endsAt}${where}`;
  if (next.startsIn !== null) {
    const wait =
      next.startsIn < 60
        ? `daqui a ${next.startsIn} min`
        : `daqui a ${Math.floor(next.startsIn / 60)}h${String(next.startsIn % 60).padStart(2, "0")}`;
    return `A seguir: ${lesson.subjectName} às ${lesson.startsAt} (${wait})${where}`;
  }
  const tomorrow = (todayWeekday + 1) % 7 === next.weekday;
  const day = tomorrow ? "amanhã" : (WEEKDAY_LABELS[next.weekday] ?? "").toLowerCase();
  return `Próxima aula: ${day} às ${lesson.startsAt}, ${lesson.subjectName}${where}`;
}

/** As aulas da semana mostrada, com as datas certas, para o calendário do telemóvel. */
export function weekIcs(timetable: StudentTimetable, weekStart: string, calendarName: string) {
  const events = timetable.days.flatMap((day) =>
    day.lessons.map((lesson, index) => {
      const date = lessonDate(weekStart, day.weekday);
      return {
        uid: `${lesson.slotId ?? `${day.weekday}-${index}`}-${date}@horario.siga.plus`,
        title: lesson.subjectName,
        description: [lesson.className, lesson.teacherName].filter(Boolean).join(" · "),
        starts_at: `${date}T${lesson.startsAt}:00+01:00`,
        ends_at: `${date}T${lesson.endsAt}:00+01:00`,
        location: lesson.room,
      };
    }),
  );
  return toIcsTimedCalendar(events, {
    calendarName,
    calendarDescription: "Aulas da semana publicadas no SIGA",
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Página só com a grelha da semana, pronta a imprimir ou guardar em PDF. */
export function printableTimetableHtml(
  timetable: StudentTimetable,
  options: { title: string; weekStart: string; teacher: boolean },
) {
  const columns = timetable.days
    .map((day) => {
      const lessons = day.lessons
        .map((lesson) => {
          const meta = [options.teacher ? lesson.className : lesson.teacherName, lesson.room]
            .filter(Boolean)
            .map((v) => escapeHtml(String(v)))
            .join(" · ");
          return `<li><span class="t">${lesson.startsAt}–${lesson.endsAt}</span><strong>${escapeHtml(lesson.subjectName)}</strong>${meta ? `<span class="m">${meta}</span>` : ""}</li>`;
        })
        .join("");
      const date = shortDate(lessonDate(options.weekStart, day.weekday));
      return `<section><h2>${WEEKDAY_LABELS[day.weekday] ?? ""} <small>${date}</small></h2><ul>${lessons}</ul></section>`;
    })
    .join("");
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${escapeHtml(options.title)}</title><style>
body{font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:24px}
h1{font-size:16px;margin:0 0 4px}p{margin:0 0 16px;color:#555}
main{display:grid;grid-template-columns:repeat(${Math.max(1, timetable.days.length)},1fr);gap:8px}
h2{font-size:12px;margin:0 0 6px}h2 small{font-weight:400;color:#666}
ul{list-style:none;margin:0;padding:0}li{border:1px solid #ccc;border-left:3px solid #6d4aff;border-radius:6px;padding:5px 7px;margin-bottom:5px;break-inside:avoid}
.t{display:block;color:#555;font-variant-numeric:tabular-nums}.m{display:block;color:#555}
@page{size:A4 landscape;margin:12mm}
</style></head><body><h1>${escapeHtml(options.title)}</h1><p>Semana de ${weekLabel(options.weekStart)}${timetable.publishedAt ? ` · publicado a ${new Date(timetable.publishedAt).toLocaleDateString("pt-PT")}` : ""}</p><main>${columns}</main></body></html>`;
}
