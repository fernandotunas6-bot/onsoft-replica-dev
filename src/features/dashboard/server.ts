import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { buildSchoolAlert, type SchoolAlert } from "./alerts";
import { averagePercent } from "@/features/students/schemas";
import { getPublicEnrollmentUrl } from "@/lib/ecosystem-urls";
import {
  academicYearProgress,
  todayInLuanda,
  type AcademicYearPhase,
} from "@/features/calendar/dates";
import { buildUpcomingCalendarItems } from "@/features/calendar/upcoming";

function countMap(entries: Array<string | null | undefined>) {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = entry?.trim() || "Sem classificação";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt"));
}

function ageBand(birthDate: string | null | undefined) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 10) return "< 10";
  if (age <= 12) return "10-12";
  if (age <= 15) return "13-15";
  if (age <= 18) return "16-18";
  return "19+";
}

function emptyOverview(role = "Utilizador") {
  return {
    role,
    academicYear: null as null | {
      name: string;
      code: string;
      starts_on: string;
      ends_on: string;
      status: string;
    },
    yearProgress: 0,
    yearPhase: "not_started" as AcademicYearPhase,
    capabilities: {
      students: false,
      finance: false,
      documents: false,
      audit: false,
    },
    productivityAudit: {
      systemHealth: "Operacional",
      databaseConnected: true,
      auditLogActive: true,
      operationalEfficiency: 100,
    },
    totals: {
      students: 0,
      activeStudents: 0,
      applicants: 0,
      male: 0,
      female: 0,
      courses: 0,
      classGroups: 0,
      rooms: 0,
      documentIssued: 0,
      documentPending: 0,
      documentTotal: 0,
      attendanceAverage: null as number | null,
    },
    studentsByClass: [] as Array<{ classe: string; alunos: number }>,
    genderSplit: [] as Array<{ name: string; value: number }>,
    enrollmentsByMonth: [] as Array<{ mes: string; matriculas: number }>,
    financeMonthly: [] as Array<{ month: string; billed: number; received: number }>,
    finance: null as null | {
      cash_balance: number;
      billed: number;
      received: number;
      outstanding: number;
      overdue: number;
      invoice_count: number;
      open_invoice_count: number;
    },
    ageDistribution: [] as Array<{ faixa: string; alunos: number }>,
    recentActivity: [] as Array<{
      id: string;
      title: string;
      detail: string;
      time: string;
      tone: string;
    }>,
    upcomingEvents: [] as Array<{
      id: string;
      title: string;
      description: string | null;
      event_date: string;
      ends_on: string | null;
      category: string;
    }>,
    announcements: [] as Array<{
      id: string;
      title: string;
      body: string;
      published_at: string | null;
    }>,
    calendarAvailable: true,
    calendarWritable: true,
    enrollmentStatus: [] as Array<{ estado: string; total: number }>,
    studentsByCourse: [] as Array<{ curso: string; alunos: number }>,
    topClasses: [] as Array<{ classe: string; curso: string; turma: string; alunos: number }>,
    enrollmentPublicLink: null as null | {
      slug: string;
      url: string;
      isOpen: boolean;
    },
    performanceHeatmap: {} as Record<
      string,
      Array<{
        classId: string;
        className: string;
        courseName: string;
        grades: Array<{ discipline: string; code: string; average: number }>;
      }>
    >,
    cashFlowForecast: {
      months: [] as Array<{
        month: string;
        expectedAmount: number;
        actualAmount: number;
        forecastAmount: number;
      }>,
      averageCollectionRate: null as number | null,
      forecastDefaultRate: null as number | null,
      mainPaymentChannel: null as string | null,
    },
    imports: {
      available: false,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      pendingJobs: 0,
      importedRows: 0,
      recent: [] as Array<{
        id: string;
        module: string;
        fileName: string | null;
        status: string;
        totalRows: number;
        importedRows: number;
        errorRows: number;
        createdAt: string | null;
      }>,
    },
  };
}

export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return emptyOverview();
    const db = await loadSgaAdminClient();

    const role = membership.appRole;
    const schoolId = membership.schoolId;
    const capabilities = {
      students: ["Administrador", "Secretaria", "Professor"].includes(role),
      finance: ["Administrador", "Tesouraria"].includes(role),
      documents: ["Administrador", "Secretaria"].includes(role),
      audit: role === "Administrador",
    };

    const overview = emptyOverview(role);
    overview.capabilities = capabilities;
    overview.calendarAvailable = true;
    overview.calendarWritable = true;

    let academicYear: {
      name: string;
      code: string;
      starts_on: string;
      ends_on: string;
      status: string;
    } | null = null;

    const { data: yearRow } = await db
      .from("academic_years")
      .select("id, name, starts_on, ends_on, status")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (yearRow) {
      academicYear = {
        name: yearRow.name,
        code: yearRow.name,
        starts_on: yearRow.starts_on,
        ends_on: yearRow.ends_on,
        status: yearRow.status,
      };
      overview.academicYear = academicYear;
      const progress = academicYearProgress(yearRow.starts_on, yearRow.ends_on, todayInLuanda());
      overview.yearProgress = progress.percent;
      overview.yearPhase = progress.phase;
    }

    if (capabilities.students) {
      try {
        const [studentsResult, programsResult, groupsResult, roomsResult, enrollmentsResult] =
          await Promise.all([
            db.from("students").select("id, status, person_id").eq("school_id", schoolId),
            db
              .from("programs")
              .select("id", { count: "exact", head: true })
              .eq("school_id", schoolId)
              .eq("is_active", true),
            db.from("class_groups").select("id, name, grade_level_id").eq("school_id", schoolId),
            db
              .from("rooms")
              .select("id", { count: "exact", head: true })
              .eq("school_id", schoolId)
              .neq("status", "inactive"),
            db
              .from("enrollments")
              .select("id, status, class_group_id, enrolled_on, student_id, attendance_rate")
              .eq("school_id", schoolId)
              .limit(500),
          ]);

        let enrollments: Array<{
          id: string;
          status: string;
          class_group_id: string | null;
          enrolled_on: string | null;
          student_id: string;
          attendance_rate: number | null;
        }> = enrollmentsResult.data ?? [];
        if (
          enrollmentsResult.error &&
          /attendance_rate|42703|schema cache/i.test(enrollmentsResult.error.message)
        ) {
          const retry = await db
            .from("enrollments")
            .select("id, status, class_group_id, enrolled_on, student_id")
            .eq("school_id", schoolId)
            .limit(500);
          enrollments = (retry.data ?? []).map((row) => ({ ...row, attendance_rate: null }));
        }

        const students = studentsResult.data ?? [];
        const personIds = [...new Set(students.map((row) => row.person_id).filter(Boolean))];
        const { data: people } = personIds.length
          ? await db.from("people").select("id, sex, date_of_birth").in("id", personIds)
          : { data: [] as Array<{ id: string; sex: string | null; date_of_birth: string | null }> };
        const peopleById = new Map((people ?? []).map((row) => [row.id, row]));

        let male = 0;
        let female = 0;
        const ageEntries: string[] = [];
        for (const student of students) {
          const person = peopleById.get(student.person_id);
          const sex = String(person?.sex ?? "").toLowerCase();
          if (sex.startsWith("m") || sex === "male" || sex === "masculino") male += 1;
          else if (sex.startsWith("f") || sex === "female" || sex === "feminino") female += 1;
          const band = ageBand(person?.date_of_birth);
          if (band) ageEntries.push(band);
        }

        const groups = (groupsResult.data ?? []) as Array<{
          id: string;
          name: string;
          grade_level_id: string | null;
        }>;
        const gradeLevelIds = [
          ...new Set(groups.map((row) => row.grade_level_id).filter(Boolean)),
        ] as string[];
        const { data: grades } = gradeLevelIds.length
          ? await db.from("grade_levels").select("id, name, program_id").in("id", gradeLevelIds)
          : { data: [] as Array<{ id: string; name: string; program_id: string | null }> };
        const gradeById = new Map((grades ?? []).map((row) => [row.id, row]));
        const programIds = [
          ...new Set((grades ?? []).map((row) => row.program_id).filter(Boolean)),
        ] as string[];
        const { data: programs } = programIds.length
          ? await db.from("programs").select("id, name").in("id", programIds)
          : { data: [] as Array<{ id: string; name: string }> };
        const programById = new Map((programs ?? []).map((row) => [row.id, row.name]));

        const activeEnrollments = enrollments.filter((row) => row.status === "active");
        const classCount = new Map<string, number>();
        const courseCount = new Map<string, number>();
        const groupById = new Map(groups.map((row) => [row.id, row]));
        for (const enrollment of activeEnrollments) {
          const group = groupById.get(String(enrollment.class_group_id));
          const className = group?.name ?? "Sem turma";
          classCount.set(className, (classCount.get(className) ?? 0) + 1);
          const grade = group?.grade_level_id ? gradeById.get(String(group.grade_level_id)) : null;
          const courseName = grade?.program_id
            ? (programById.get(String(grade.program_id)) ?? "Sem curso")
            : "Sem curso";
          courseCount.set(courseName, (courseCount.get(courseName) ?? 0) + 1);
        }

        const monthMap = new Map<string, number>();
        for (const enrollment of enrollments) {
          const month = String(enrollment.enrolled_on ?? "").slice(0, 7);
          if (!month) continue;
          monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
        }

        overview.totals = {
          students: students.length,
          activeStudents: students.filter((row) => String(row.status) === "active").length,
          applicants: students.filter((row) => String(row.status) === "applicant").length,
          male,
          female,
          courses: programsResult.count ?? 0,
          classGroups: groups.length,
          rooms: roomsResult.count ?? 0,
          documentIssued: 0,
          documentPending: 0,
          documentTotal: 0,
          attendanceAverage: averagePercent(
            activeEnrollments.map((row) =>
              "attendance_rate" in row ? Number(row.attendance_rate) : null,
            ),
          ),
        };
        overview.studentsByClass = [...classCount.entries()]
          .map(([classe, alunos]) => ({ classe, alunos }))
          .sort((a, b) => b.alunos - a.alunos || a.classe.localeCompare(b.classe, "pt"));
        overview.studentsByCourse = [...courseCount.entries()]
          .map(([curso, alunos]) => ({ curso, alunos }))
          .sort((a, b) => b.alunos - a.alunos || a.curso.localeCompare(b.curso, "pt"));
        overview.topClasses = overview.studentsByClass.slice(0, 4).map((row) => {
          const group = groups.find((item) => item.name === row.classe);
          const grade = group?.grade_level_id ? gradeById.get(String(group.grade_level_id)) : null;
          const curso = grade?.program_id
            ? (programById.get(String(grade.program_id)) ?? "—")
            : "—";
          return {
            classe: row.classe,
            curso,
            turma: row.classe,
            alunos: row.alunos,
          };
        });
        overview.genderSplit = [
          { name: "Masculino", value: male },
          { name: "Feminino", value: female },
          {
            name: "Não indicado",
            value: Math.max(students.length - male - female, 0),
          },
        ].filter((row) => row.value > 0);
        overview.enrollmentsByMonth = [...monthMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-8)
          .map(([month, matriculas]) => ({
            mes: new Date(`${month}-01T00:00:00`).toLocaleDateString("pt-PT", {
              month: "short",
              year: "2-digit",
            }),
            matriculas,
          }));
        overview.ageDistribution = countMap(ageEntries).map((row) => ({
          faixa: row.label,
          alunos: row.total,
        }));
        overview.enrollmentStatus = countMap(enrollments.map((row) => row.status)).map((row) => ({
          estado: row.label,
          total: row.total,
        }));
      } catch {
        /* degradação graciosa caso tabelas de estudantes falhem */
      }
    }

    if (capabilities.students) {
      try {
        // Heatmap de desempenho: médias por turma e disciplina, por trimestre.
        const [{ data: heatmapGrades }, { data: heatmapGroups }, { data: heatmapSubjects }] =
          await Promise.all([
            db
              .from("term_grades")
              .select("enrollment_id, subject_id, term, mac, npp, npt")
              .eq("school_id", schoolId)
              .is("deleted_at", null)
              .limit(5000),
            db.from("class_groups").select("id, name, grade_level_id").eq("school_id", schoolId),
            db.from("subjects").select("id, name, code").eq("school_id", schoolId),
          ]);

        const { data: heatmapEnrollments } = await db
          .from("enrollments")
          .select("id, class_group_id")
          .eq("school_id", schoolId)
          .limit(1000);
        const groupByEnrollment = new Map(
          (heatmapEnrollments ?? []).map((row) => [String(row.id), String(row.class_group_id)]),
        );
        const subjectInfo = new Map(
          (heatmapSubjects ?? []).map((row) => [
            String(row.id),
            { name: String(row.name ?? "—"), code: String(row.code ?? "") },
          ]),
        );
        const groupInfo = new Map(
          (heatmapGroups ?? []).map((row) => [
            String(row.id),
            { name: String(row.name ?? "Turma"), gradeLevelId: row.grade_level_id },
          ]),
        );
        const heatmapGradeLevelIds = [
          ...new Set((heatmapGroups ?? []).map((row) => row.grade_level_id).filter(Boolean)),
        ] as string[];
        const { data: heatmapLevels } = heatmapGradeLevelIds.length
          ? await db.from("grade_levels").select("id, program_id").in("id", heatmapGradeLevelIds)
          : { data: [] as Array<{ id: string; program_id: string | null }> };
        const heatmapProgramIds = [
          ...new Set((heatmapLevels ?? []).map((row) => row.program_id).filter(Boolean)),
        ] as string[];
        const { data: heatmapPrograms } = heatmapProgramIds.length
          ? await db.from("programs").select("id, name").in("id", heatmapProgramIds)
          : { data: [] as Array<{ id: string; name: string }> };
        const programNameByLevel = new Map(
          (heatmapLevels ?? []).map((level) => [
            String(level.id),
            String(
              (heatmapPrograms ?? []).find((program) => program.id === level.program_id)?.name ??
                "—",
            ),
          ]),
        );

        const buckets = new Map<string, { sum: number; count: number }>();
        for (const grade of heatmapGrades ?? []) {
          const groupId = groupByEnrollment.get(String(grade.enrollment_id));
          if (!groupId) continue;
          const mac = Number(grade.mac ?? 0);
          const npp = Number(grade.npp ?? 0);
          const npt = Number(grade.npt ?? 0);
          const average = (mac + npp + npt) / 3;
          if (!Number.isFinite(average) || average <= 0) continue;
          const key = `${Number(grade.term ?? 1)}|${groupId}|${String(grade.subject_id)}`;
          const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
          bucket.sum += average;
          bucket.count += 1;
          buckets.set(key, bucket);
        }

        const heatmap: Record<
          string,
          Map<
            string,
            {
              classId: string;
              className: string;
              courseName: string;
              grades: Array<{ discipline: string; code: string; average: number }>;
            }
          >
        > = {};
        for (const [key, bucket] of buckets) {
          const [termRaw, groupId, subjectId] = key.split("|");
          const termKey = `t${termRaw}`;
          const group = groupInfo.get(String(groupId));
          const subject = subjectInfo.get(String(subjectId));
          if (!group || !subject) continue;
          heatmap[termKey] ??= new Map();
          const row = heatmap[termKey]!.get(String(groupId)) ?? {
            classId: String(groupId),
            className: group.name,
            courseName: group.gradeLevelId
              ? (programNameByLevel.get(String(group.gradeLevelId)) ?? "—")
              : "—",
            grades: [],
          };
          row.grades.push({
            discipline: subject.name,
            code: subject.code,
            average: Math.round((bucket.sum / bucket.count) * 10) / 10,
          });
          heatmap[termKey]!.set(String(groupId), row);
        }
        overview.performanceHeatmap = Object.fromEntries(
          Object.entries(heatmap).map(([term, rows]) => [
            term,
            [...rows.values()].sort((a, b) => a.className.localeCompare(b.className, "pt")),
          ]),
        );
      } catch {
        /* degradação graciosa caso as notas não estejam disponíveis */
      }
    }

    if (capabilities.documents) {
      const { data: docs, error } = await db
        .from("document_requests")
        .select("id, template_name, status, notes, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error) {
        const rows = docs ?? [];
        overview.totals.documentTotal = rows.length;
        overview.totals.documentIssued = rows.filter((row) =>
          ["approved", "ready", "delivered", "issued", "completed"].includes(String(row.status)),
        ).length;
        overview.totals.documentPending = rows.filter((row) =>
          ["submitted", "in_review", "queued", "processing", "pending_payment"].includes(
            String(row.status),
          ),
        ).length;
        overview.recentActivity = rows.slice(0, 6).map((row) => ({
          id: String(row.id),
          title: String(row.template_name ?? "Documento"),
          detail: String(row.notes ?? row.status ?? "Pedido"),
          time: new Date(String(row.created_at)).toLocaleDateString("pt-PT"),
          tone: ["approved", "ready", "delivered", "issued"].includes(String(row.status))
            ? "success"
            : "info",
        }));
      }
    }

    if (capabilities.finance) {
      const [{ data: invoices }, { data: receipts }] = await Promise.all([
        db
          .from("finance_invoices")
          .select("id, amount, discount_amount, competence_month, status, due_date")
          .eq("school_id", schoolId)
          .limit(250),
        db
          .from("finance_receipts")
          .select("invoice_id, amount, paid_on, status")
          .eq("school_id", schoolId)
          .limit(250),
      ]);

      const paidByInvoice = new Map<string, number>();
      const receivedByMonth = new Map<string, number>();
      for (const receipt of receipts ?? []) {
        if (receipt.status === "reversed") continue;
        paidByInvoice.set(
          String(receipt.invoice_id),
          (paidByInvoice.get(String(receipt.invoice_id)) ?? 0) + Number(receipt.amount ?? 0),
        );
        const month = String(receipt.paid_on ?? "").slice(0, 7);
        if (month) {
          receivedByMonth.set(
            month,
            (receivedByMonth.get(month) ?? 0) + Number(receipt.amount ?? 0),
          );
        }
      }

      let billed = 0;
      let received = 0;
      let outstanding = 0;
      let overdue = 0;
      let openCount = 0;
      const billedByMonth = new Map<string, number>();
      const today = todayInLuanda();

      for (const invoice of invoices ?? []) {
        if (invoice.status === "cancelled") continue;
        const total = Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0);
        const paid = paidByInvoice.get(String(invoice.id)) ?? 0;
        const openAmount = Math.max(total - paid, 0);
        billed += total;
        received += Math.min(paid, total);
        outstanding += openAmount;
        if (openAmount > 0) {
          openCount += 1;
          if (String(invoice.due_date) < today) overdue += openAmount;
        }
        const month = String(invoice.competence_month ?? "").slice(0, 7);
        if (month) billedByMonth.set(month, (billedByMonth.get(month) ?? 0) + total);
      }

      const months = [...new Set([...billedByMonth.keys(), ...receivedByMonth.keys()])].sort();
      overview.financeMonthly = months.slice(-6).map((month) => ({
        month: `${month}-01`,
        billed: billedByMonth.get(month) ?? 0,
        received: receivedByMonth.get(month) ?? 0,
      }));
      overview.finance = {
        cash_balance: received,
        billed,
        received,
        outstanding,
        overdue,
        invoice_count: (invoices ?? []).filter((row) => row.status !== "cancelled").length,
        open_invoice_count: openCount,
      };

      if (!overview.recentActivity.length) {
        overview.recentActivity = (receipts ?? []).slice(0, 5).map((row, index) => ({
          id: `${row.invoice_id ?? "recibo"}-${row.paid_on ?? index}`,
          title: "Recebimento",
          detail: `${Number(row.amount ?? 0).toLocaleString("pt-PT")} Kz`,
          time: String(row.paid_on ?? "").slice(0, 10),
          tone: "success",
        }));
      }
    }

    const fromDate = todayInLuanda();
    const { data: terms } = await db
      .from("terms")
      .select("id, name, starts_on, ends_on, sequence")
      .eq("school_id", schoolId)
      .gte("ends_on", fromDate)
      .order("starts_on", { ascending: true })
      .limit(20);
    overview.upcomingEvents = buildUpcomingCalendarItems(
      (terms ?? []).map((term) => ({
        id: String(term.id),
        title: String(term.name),
        description: `Período lectivo ${term.sequence ?? ""}`.trim(),
        event_date: String(term.starts_on),
        ends_on: term.ends_on ? String(term.ends_on) : null,
      })),
      fromDate,
    );

    const { data: announcementRows, error: announcementError } = await db
      .from("announcements")
      .select("id, title, body, published_at, status")
      .eq("school_id", schoolId)
      .or(`status.eq.published,and(status.eq.scheduled,scheduled_for.lte.${fromDate})`)
      .order("published_at", { ascending: false })
      .limit(5);
    if (!announcementError) {
      overview.announcements = (announcementRows ?? []).map((row) => ({
        id: String(row.id),
        title: String(row.title ?? "Comunicado"),
        body: String(row.body ?? ""),
        published_at: row.published_at ? String(row.published_at) : null,
      }));
    }

    if (capabilities.audit) {
      const { data: audits } = await db
        .from("audit_logs")
        .select("id, action, entity_type, occurred_at")
        .eq("school_id", schoolId)
        .order("occurred_at", { ascending: false })
        .limit(6);
      if (audits?.length) {
        overview.recentActivity = audits.map(
          (row: { id: string; action: string; entity_type: string; occurred_at: string }) => {
            const op = String(row.action ?? "")
              .split(".")
              .at(-1)
              ?.toLowerCase();
            const verb = op === "insert" ? "Criou" : op === "delete" ? "Eliminou" : "Actualizou";
            return {
              id: String(row.id),
              title: `${verb} ${row.entity_type ?? "registo"}`,
              detail: String(row.action ?? ""),
              time: new Date(String(row.occurred_at)).toLocaleDateString("pt-PT"),
              tone: "info",
            };
          },
        );
      }
    }

    const { data: enrollmentForm } = await db
      .from("enrollment_forms")
      .select("slug, is_open")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (enrollmentForm?.slug) {
      overview.enrollmentPublicLink = {
        slug: enrollmentForm.slug,
        url: getPublicEnrollmentUrl(enrollmentForm.slug),
        isOpen: Boolean(enrollmentForm.is_open),
      };
    }

    if (capabilities.students || capabilities.finance) {
      try {
        const { data: jobs, error: jobsError } = await db
          .from("import_jobs")
          .select(
            "id, module, file_name, status, total_rows, imported_rows, error_rows, created_at",
          )
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(30);
        if (!jobsError && jobs) {
          const rows = jobs as Array<Record<string, unknown>>;
          overview.imports.available = true;
          overview.imports.totalJobs = rows.length;
          overview.imports.completedJobs = rows.filter((row) => row.status === "completed").length;
          overview.imports.failedJobs = rows.filter((row) =>
            ["failed", "cancelled", "rolled_back"].includes(String(row.status)),
          ).length;
          overview.imports.pendingJobs = rows.filter((row) =>
            ["uploaded", "analyzing", "mapping", "validating", "ready", "importing"].includes(
              String(row.status),
            ),
          ).length;
          overview.imports.importedRows = rows.reduce(
            (total, row) => total + Number(row.imported_rows ?? 0),
            0,
          );
          overview.imports.recent = rows.slice(0, 5).map((row) => ({
            id: String(row.id),
            module: String(row.module ?? "—"),
            fileName: row.file_name ? String(row.file_name) : null,
            status: String(row.status ?? "—"),
            totalRows: Number(row.total_rows ?? 0),
            importedRows: Number(row.imported_rows ?? 0),
            errorRows: Number(row.error_rows ?? 0),
            createdAt: row.created_at ? String(row.created_at) : null,
          }));
        }
      } catch {
        /* motor de importação indisponível: o painel continua */
      }
    }

    return overview;
  });

export const listSchoolAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [] as SchoolAlert[];
    const db = await loadSgaAdminClient();
    const role = membership.appRole;
    const schoolId = membership.schoolId;
    const canStudents = ["Administrador", "Secretaria"].includes(role);
    const canFinance = ["Administrador", "Tesouraria"].includes(role);
    const alerts: SchoolAlert[] = [];

    if (canStudents) {
      try {
        const [{ count: applicantCount }, applications, documents] = await Promise.all([
          db
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .eq("status", "applicant"),
          db
            .from("enrollment_applications")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .eq("status", "pending")
            .is("deleted_at", null),
          db
            .from("document_requests")
            .select("id, status")
            .eq("school_id", schoolId)
            .in("status", ["submitted", "in_review", "queued", "processing"])
            .limit(80),
        ]);

        let pendingApps = 0;
        if (applications.error && /deleted_at|42703/i.test(applications.error.message)) {
          const retry = await db
            .from("enrollment_applications")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .eq("status", "pending");
          pendingApps = retry.error ? 0 : (retry.count ?? 0);
        } else if (!applications.error) {
          pendingApps = applications.count ?? 0;
        }

        const pendingDocs = documents.error ? 0 : (documents.data ?? []).length;
        const candidaturas = buildSchoolAlert("candidaturas", pendingApps);
        const matricula = buildSchoolAlert("matricula", applicantCount ?? 0);
        const documentos = buildSchoolAlert("documentos", pendingDocs);
        if (candidaturas) alerts.push(candidaturas);
        if (matricula) alerts.push(matricula);
        if (documentos) alerts.push(documentos);
      } catch {
        /* tabelas em falta: o sino continua só com o que existir */
      }
    }

    if (canFinance) {
      try {
        const [{ data: invoices }, { data: receipts }] = await Promise.all([
          db
            .from("finance_invoices")
            .select("id, amount, discount_amount, status, due_date")
            .eq("school_id", schoolId)
            .limit(250),
          db
            .from("finance_receipts")
            .select("invoice_id, amount, status")
            .eq("school_id", schoolId)
            .limit(250),
        ]);
        const paidByInvoice = new Map<string, number>();
        for (const receipt of receipts ?? []) {
          if (receipt.status === "reversed") continue;
          paidByInvoice.set(
            String(receipt.invoice_id),
            (paidByInvoice.get(String(receipt.invoice_id)) ?? 0) + Number(receipt.amount ?? 0),
          );
        }
        const today = todayInLuanda();
        let overdueCount = 0;
        for (const invoice of invoices ?? []) {
          if (invoice.status === "cancelled") continue;
          const total = Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0);
          const paid = paidByInvoice.get(String(invoice.id)) ?? 0;
          const openAmount = Math.max(total - paid, 0);
          if (openAmount > 0 && String(invoice.due_date ?? "") < today) overdueCount += 1;
        }
        const faturas = buildSchoolAlert("faturas", overdueCount);
        if (faturas) alerts.push(faturas);
      } catch {
        /* tesouraria indisponível: o sino continua */
      }
    }

    return alerts;
  });
