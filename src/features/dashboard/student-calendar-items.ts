import type { UpcomingCalendarItem } from "@/features/calendar/upcoming";
import type { StudentUpcomingAssessment } from "@/features/dashboard/student-agenda";

/** Avaliações marcadas da turma como itens do calendário da escola. */
export function assessmentCalendarItems(
  assessments: StudentUpcomingAssessment[] | undefined,
): UpcomingCalendarItem[] {
  return (assessments ?? []).map((item, index) => ({
    id: `assessment-${item.date}-${index}`,
    title: `${item.subjectName} · ${item.name}`,
    description: null,
    event_date: item.date.slice(0, 10),
    ends_on: item.date.slice(0, 10),
    category: "assessment",
  }));
}
