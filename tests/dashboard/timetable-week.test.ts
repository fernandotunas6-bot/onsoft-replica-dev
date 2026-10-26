import { describe, expect, it } from "vitest";
import {
  lessonDate,
  nextLessonInfo,
  nextLessonText,
  printableTimetableHtml,
  weekLabel,
  weekMonday,
} from "@/features/dashboard/timetable-week";

const lesson = (startsAt: string, endsAt: string, subjectName: string) => ({
  slotId: `${subjectName}-${startsAt}`,
  startsAt,
  endsAt,
  subjectName,
  teacherName: "Ana",
  room: "Sala D101",
});
const days = [
  {
    weekday: 2,
    lessons: [lesson("07:00", "07:45", "Matemática"), lesson("10:35", "11:20", "Física")],
  },
  { weekday: 4, lessons: [lesson("07:00", "07:45", "Química")] },
];

describe("semana do horário", () => {
  it("datas e rótulo da semana", () => {
    expect(weekMonday("2026-10-29")).toBe("2026-10-26");
    expect(lessonDate("2026-10-26", 4)).toBe("2026-10-29");
    expect(lessonDate("2026-10-26", 0)).toBe("2026-11-01"); // domingo
    expect(weekLabel("2026-10-26")).toBe("26 out – 1 nov");
  });

  it("próxima aula: mais tarde hoje, noutro dia e no fim da semana", () => {
    const later = nextLessonInfo(days, 2, "09:00")!;
    expect(nextLessonText(later, 2)).toBe("A seguir: Física às 10:35 (daqui a 1h35) · Sala D101");
    expect(nextLessonText(nextLessonInfo(days, 2, "10:20")!, 2)).toContain("(daqui a 15 min)");
    expect(nextLessonText(nextLessonInfo(days, 2, "12:00")!, 2)).toBe(
      "Próxima aula: quinta às 07:00, Química · Sala D101",
    );
    expect(nextLessonText(nextLessonInfo(days, 3, "08:00")!, 3)).toBe(
      "Próxima aula: amanhã às 07:00, Química · Sala D101",
    );
    expect(nextLessonInfo(days, 5, "08:00")).toBeNull();
  });

  it("a página de impressão escapa o que vem da base", () => {
    const html = printableTimetableHtml(
      {
        className: "10ª A",
        publishedAt: null,
        days: [{ weekday: 1, lessons: [lesson("07:00", "07:45", "<script>x</script>")] }],
      },
      { title: "Horário <b>", weekStart: "2026-10-26", teacher: false },
    );
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("<title>Horário &lt;b&gt;</title>");
  });
});
