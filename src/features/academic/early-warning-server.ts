/**
 * Contexto dos sinais automáticos de risco de uma turma: faltas reais (chamada
 * do SIGA), ciclo da turma e limite de faltas do modelo em vigor. As notas vêm
 * do espaço pedagógico que a página já carrega.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import { absenceByEnrollment, classCycle } from "./exam-data";

const READ_ROLES = ["Administrador", "Secretaria", "Professor"] as const;

export type ClassWarningContext = {
  cycle: string;
  maximumAbsencePercentage: number | null;
  absences: Record<string, number>;
};

export const getClassWarningContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ classGroupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ClassWarningContext> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: group } = await db
      .from("class_groups")
      .select("id, academic_year_id")
      .eq("school_id", schoolId)
      .eq("id", data.classGroupId)
      .maybeSingle();
    if (!group) throw new Error("Turma não encontrada nesta escola.");

    const [cycle, { data: rule }, { data: enrollments }] = await Promise.all([
      classCycle(db, schoolId, data.classGroupId),
      db
        .from("assessment_rule_sets")
        .select("maximum_absence_percentage")
        .eq("school_id", schoolId)
        .eq("code", "DEFAULT")
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      db
        .from("enrollments")
        .select("id")
        .eq("school_id", schoolId)
        .eq("class_group_id", data.classGroupId)
        .in("status", ["active", "pending"]),
    ]);
    const absences = group.academic_year_id
      ? await absenceByEnrollment(
          db,
          schoolId,
          String(group.academic_year_id),
          data.classGroupId,
          (enrollments ?? []).map((e) => String(e.id)),
        )
      : new Map<string, number>();
    const limit =
      rule?.maximum_absence_percentage == null ? NaN : Number(rule.maximum_absence_percentage);
    return {
      cycle,
      maximumAbsencePercentage: Number.isFinite(limit) ? limit : null,
      absences: Object.fromEntries(absences),
    };
  });
