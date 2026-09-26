/**
 * Contagens reais do ano lectivo para o separador "Estrutura académica".
 * Só contagens (head: true), nunca dados de alunos. Pessoal da escola.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import type { AcademicStructureCounts } from "./academic-architecture";

const inputSchema = z.object({ academicYearId: z.string().uuid().optional() });

export const getAcademicStructureStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AcademicStructureCounts> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;

    let yearQuery = db.from("academic_years").select("id, name, status").eq("school_id", schoolId);
    yearQuery = data.academicYearId
      ? yearQuery.eq("id", data.academicYearId)
      : yearQuery.eq("status", "active").order("starts_on", { ascending: false }).limit(1);
    const { data: year } = await yearQuery.maybeSingle();
    const yearId = year?.id ? String(year.id) : null;

    const n = (res: { count: number | null; error: unknown }) => (res.error ? 0 : (res.count ?? 0));
    const head = { count: "exact" as const, head: true };
    const tally = (rows: Array<{ status: unknown }> | null) => {
      const out: Record<string, number> = {};
      for (const row of rows ?? []) out[String(row.status)] = (out[String(row.status)] ?? 0) + 1;
      return out;
    };

    const { data: groups } = yearId
      ? await db
          .from("class_groups")
          .select("id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .limit(2000)
      : { data: [] as Array<{ id: string }> };
    const groupIds = (groups ?? []).map((g) => String(g.id));
    const hasGroups = groupIds.length > 0;
    const noGroup = ["00000000-0000-0000-0000-000000000000"];
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [
      ruleSetsRes,
      subjectsRes,
      termsRes,
      classSubjectsRes,
      withTeacherRes,
      enrollmentsRes,
      assessmentsRes,
      gradebooksRes,
      gradeSheetsRes,
      pendingRes,
      historyRes,
      auditRes,
    ] = await Promise.all([
      db
        .from("assessment_rule_sets")
        .select("id", head)
        .eq("school_id", schoolId)
        .eq("status", "active"),
      db.from("subjects").select("id", head).eq("school_id", schoolId).eq("status", "active"),
      db
        .from("terms")
        .select("id", head)
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId ?? noGroup[0]),
      db
        .from("class_subjects")
        .select("id", head)
        .eq("school_id", schoolId)
        .in("class_group_id", hasGroups ? groupIds : noGroup)
        .eq("status", "active"),
      db
        .from("class_subjects")
        .select("id", head)
        .eq("school_id", schoolId)
        .in("class_group_id", hasGroups ? groupIds : noGroup)
        .eq("status", "active")
        .not("teacher_id", "is", null),
      db
        .from("enrollments")
        .select("id", head)
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId ?? noGroup[0])
        .in("status", ["active", "pending"]),
      db
        .from("siga_assessment_items")
        .select("id", head)
        .eq("school_id", schoolId)
        .in("class_group_id", hasGroups ? groupIds : noGroup),
      db
        .from("gradebooks")
        .select("status")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId ?? noGroup[0])
        .limit(5000),
      db
        .from("grade_sheets")
        .select("status")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId ?? noGroup[0])
        .limit(5000),
      db
        .from("grade_scores")
        .select("id", head)
        .eq("school_id", schoolId)
        .not("pending_score", "is", null),
      db.from("student_academic_history").select("id", head).eq("school_id", schoolId),
      db
        .from("audit_logs")
        .select("id", head)
        .eq("school_id", schoolId)
        .in("entity_type", [
          "grade_scores",
          "siga_assessment_scores",
          "siga_assessment_items",
          "grade_sheets",
        ])
        .gte("occurred_at", since),
    ]);

    // Exames: contagens à parte, porque as tabelas podem ainda não existir.
    let examSessions = 0;
    let examRegistrations = 0;
    if (yearId) {
      const { data: sessions, error: sessionsError } = await db
        .from("siga_exam_sessions")
        .select("id")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .limit(200);
      if (!sessionsError && sessions?.length) {
        examSessions = sessions.length;
        examRegistrations = n(
          await db
            .from("siga_exam_registrations")
            .select("id", head)
            .eq("school_id", schoolId)
            .in(
              "session_id",
              sessions.map((s) => String(s.id)),
            )
            .neq("status", "cancelled"),
        );
      }
    }

    const activeRuleSets = n(ruleSetsRes);
    const subjects = n(subjectsRes);
    const terms = yearId ? n(termsRes) : 0;
    const classSubjects = hasGroups ? n(classSubjectsRes) : 0;
    const classSubjectsWithTeacher = hasGroups ? n(withTeacherRes) : 0;
    const enrollments = yearId ? n(enrollmentsRes) : 0;
    const assessments = hasGroups ? n(assessmentsRes) : 0;
    const gradebooks = yearId && !gradebooksRes.error ? tally(gradebooksRes.data) : {};
    const gradeSheets = yearId && !gradeSheetsRes.error ? tally(gradeSheetsRes.data) : {};
    const pendingGradeChanges = n(pendingRes);
    const historyRecords = n(historyRes);
    const auditEvents30d = n(auditRes);

    return {
      yearName: year?.name ? String(year.name) : null,
      yearActive: year?.status === "active",
      activeRuleSets,
      subjects,
      terms,
      classGroups: groupIds.length,
      classSubjects,
      classSubjectsWithTeacher,
      enrollments,
      assessments,
      gradebooks,
      gradeSheets,
      pendingGradeChanges,
      historyRecords,
      auditEvents30d,
      examSessions,
      examRegistrations,
    };
  });
