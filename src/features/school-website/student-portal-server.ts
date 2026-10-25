import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { getMyStudentAgenda, getMyStudentTimetable } from "@/features/dashboard/student-agenda";
import { getMyStudentGrades } from "@/features/academic/student-grades";
import { getStudentAttendanceHistory } from "@/features/pedagogica/attendance-server";
import { studentPortalSections } from "./student-portal-bridge";

export const studentWebsitePageInput = z
  .object({ schoolId: z.string().guid(), section: z.enum(studentPortalSections) })
  .strict();

/** One authenticated request binds every underlying read to the same active school. */
export const getStudentWebsitePage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => studentWebsitePageInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || membership.appRole !== "Aluno" || membership.schoolId !== data.schoolId)
      throw Object.assign(
        new Error("Esta conta não tem acesso ao portal de estudante desta escola."),
        { statusCode: 403 },
      );
    if (data.section === "") {
      const [agenda, attendance] = await Promise.all([
        getMyStudentAgenda(),
        getStudentAttendanceHistory({ data: {} }),
      ]);
      return { agenda, attendance: { stats: attendance.stats } };
    }
    if (data.section === "horarios") return { timetable: await getMyStudentTimetable() };
    if (data.section === "notas" || data.section === "disciplinas") {
      const [grades, attendance] = await Promise.all([
        getMyStudentGrades(),
        data.section === "notas"
          ? getStudentAttendanceHistory({ data: {} })
          : Promise.resolve(null),
      ]);
      return {
        year: grades.years.find((year) => year.isCurrent) ?? grades.years[0] ?? null,
        ...(attendance ? { attendance: { stats: attendance.stats } } : {}),
      };
    }
    return {};
  });
