import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { listPedagogicalWorkspaceInputSchema } from "./schemas";
import { listPedagogicalWorkspace as legacyListPedagogicalWorkspace } from "./server-legacy";

async function resolvePortalStudentIds(params: {
  schoolId: string;
  userId: string;
  appRole: string;
}) {
  const db = await loadSgaAdminClient();
  const { data: people, error: peopleError } = await db
    .from("people")
    .select("id")
    .eq("school_id", params.schoolId)
    .eq("user_id", params.userId);
  if (peopleError) {
    throw publicDatabaseError(peopleError, "Não foi possível validar a identidade académica.");
  }
  const personIds = (people ?? []).map((row) => String(row.id));
  if (!personIds.length) return new Set<string>();

  if (params.appRole === "Aluno") {
    const { data: students, error } = await db
      .from("students")
      .select("id")
      .eq("school_id", params.schoolId)
      .in("person_id", personIds);
    if (error) throw publicDatabaseError(error, "Não foi possível validar o aluno da conta.");
    return new Set((students ?? []).map((row) => String(row.id)));
  }

  const { data: links, error: linksError } = await db
    .from("student_guardians")
    .select("student_id")
    .eq("school_id", params.schoolId)
    .in("guardian_person_id", personIds);
  if (linksError) {
    throw publicDatabaseError(linksError, "Não foi possível validar os educandos vinculados.");
  }
  return new Set((links ?? []).map((row) => String(row.student_id)));
}

export const listPedagogicalWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listPedagogicalWorkspaceInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    if (membership.appRole === "Tesouraria" || membership.appRole === "Utilizador") {
      throw new Error("Este perfil não tem acesso ao workspace pedagógico.");
    }

    const workspace = await legacyListPedagogicalWorkspace({ data });
    if (membership.appRole === "Administrador" || membership.appRole === "Secretaria") {
      return workspace;
    }

    if (membership.appRole === "Professor") {
      const db = await loadSgaAdminClient();
      const { data: teacher, error: teacherError } = await db
        .from("teachers")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("user_id", context.userId)
        .eq("status", "active")
        .maybeSingle();
      if (teacherError) {
        throw publicDatabaseError(teacherError, "Não foi possível validar o professor.");
      }
      if (!teacher?.id) throw new Error("A conta não está ligada a um professor activo.");

      const assignments = workspace.classSubjects.filter(
        (row) => String(row.teacher_id ?? "") === String(teacher.id),
      );
      const groupIds = new Set(assignments.map((row) => String(row.class_group_id)));
      const subjectIds = new Set(assignments.map((row) => String(row.subject_id)));

      return {
        ...workspace,
        classGroups: workspace.classGroups.filter((row) => groupIds.has(String(row.id))),
        subjects: workspace.subjects.filter((row) => subjectIds.has(String(row.id))),
        classSubjects: assignments,
        termGrades: workspace.termGrades.filter(
          (row) =>
            Boolean(row.class_group_id) &&
            groupIds.has(String(row.class_group_id)) &&
            subjectIds.has(String(row.subject_id)),
        ),
        enrollmentOptions: workspace.enrollmentOptions.filter(
          (row) => Boolean(row.class_group_id) && groupIds.has(String(row.class_group_id)),
        ),
        scheduleSlots: workspace.scheduleSlots.filter(
          (row) => String(row.teacher_id ?? "") === String(teacher.id),
        ),
      };
    }

    if (membership.appRole === "Aluno" || membership.appRole === "Encarregado") {
      const studentIds = await resolvePortalStudentIds({
        schoolId: membership.schoolId,
        userId: context.userId,
        appRole: membership.appRole,
      });
      if (!studentIds.size) {
        return {
          ...workspace,
          classGroups: [],
          subjects: [],
          classSubjects: [],
          termGrades: [],
          enrollmentOptions: [],
          scheduleSlots: [],
        };
      }

      const enrollmentOptions = workspace.enrollmentOptions.filter((row) =>
        studentIds.has(String(row.student_id)),
      );
      const groupIds = new Set(
        enrollmentOptions
          .map((row) => row.class_group_id)
          .filter((id): id is string => Boolean(id))
          .map(String),
      );
      const classSubjects = workspace.classSubjects.filter((row) =>
        groupIds.has(String(row.class_group_id)),
      );
      const subjectIds = new Set(classSubjects.map((row) => String(row.subject_id)));

      return {
        ...workspace,
        classGroups: workspace.classGroups.filter((row) => groupIds.has(String(row.id))),
        subjects: workspace.subjects.filter((row) => subjectIds.has(String(row.id))),
        classSubjects,
        termGrades: workspace.termGrades.filter((row) =>
          row.student_id ? studentIds.has(String(row.student_id)) : false,
        ),
        enrollmentOptions,
        scheduleSlots: workspace.scheduleSlots.filter(
          (row) => Boolean(row.class_group_id) && groupIds.has(String(row.class_group_id)),
        ),
      };
    }

    throw new Error("Sem permissão para consultar o workspace pedagógico.");
  });
