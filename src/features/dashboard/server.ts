import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

/**
 * Terceira fatia do ARQ-01, e a que mais interessa: o dashboard lê alunos,
 * matrículas, facturas, recibos e assiduidade — os dados que não podem
 * atravessar escolas. Passa a ler com `context.supabase`, que leva o JWT e
 * respeita RLS. Não escreve nada, o que torna esta fatia inteira e não parcial.
 *
 * Verificado antes de trocar, na produção a 2026-09-14, porque as políticas
 * destas tabelas não são simples «mesma escola» — são sensíveis ao papel:
 *
 *   · `finance_invoices` só tem `private.has_permission(school_id,
 *     'finance.invoices.read')`. Quem não tiver a permissão vê zero facturas.
 *   · `students` tem três políticas somadas: a do professor (só as turmas
 *     atribuídas), a de membro com `can_read_students()`, e a de permissão.
 *
 * A questão era se algum cartão passaria a aparecer vazio. Não passa: na base,
 * `finance.invoices.read` pertence a admin, owner, treasury e guardian, e o
 * gate desta função já era `["Administrador", "Tesouraria"]`; `students.records.read`
 * pertence a seis papéis, mais do que os três que a função deixa entrar. Ou
 * seja, para cada papel que chega aqui, a base concede pelo menos o que o
 * TypeScript já concedia — o resultado é o mesmo e passa a haver duas barreiras
 * em vez de uma.
 */
import { buildSchoolAlert, type SchoolAlert } from "./alerts";
import { averagePercent } from "@/features/students/schemas";
import { getPublicEnrollmentUrl } from "@/lib/ecosystem-urls";
import {
  academicYearProgress,
  todayInLuanda,
  type AcademicYearPhase,
} from "@/features/calendar/dates";
import { buildUpcomingCalendarItems } from "@/features/calendar/upcoming";
import {
  emptySchoolTodayOps,
  isStartingWithinMinutes,
  nowTimeInLuanda,
  weekdayJsFromIso,
  type SchoolTodayOps,
} from "./school-today";

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
    const db = context.supabase;

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
              .from("siga_assessment_scores")
              .select(
                "score, enrollment_id, siga_assessment_items!inner(term, subject_id, max_score)",
              )
              .eq("school_id", schoolId)
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
          // O item é que carrega trimestre e disciplina; a nota vem normalizada
          // à escala de 20, porque max_score varia entre tipos de avaliação.
          const item = Array.isArray(grade.siga_assessment_items)
            ? grade.siga_assessment_items[0]
            : grade.siga_assessment_items;
          if (!item) continue;
          const maxScore = Number(item.max_score ?? 20) || 20;
          const average = (Number(grade.score ?? 0) / maxScore) * 20;
          if (!Number.isFinite(average) || average <= 0) continue;
          const key = `${Number(item.term ?? 1)}|${groupId}|${String(item.subject_id)}`;
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
        .select("id, status, purpose, review_note, created_at, document_templates(name)")
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
          title: String(
            (Array.isArray(row.document_templates)
              ? row.document_templates[0]?.name
              : row.document_templates?.name) ?? "Documento",
          ),
          detail: String(row.review_note ?? row.purpose ?? row.status ?? "Pedido"),
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
          .limit(3000),
        db
          .from("finance_receipts")
          .select("invoice_id, amount, paid_on, status, payment_method")
          .eq("school_id", schoolId)
          .limit(3000),
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

      // Projeção de fluxo de caixa: histórico real + estimativa dos próximos 3 meses.
      const collectionRate = billed > 0 ? Math.round((received / billed) * 1000) / 10 : null;
      const monthLabel = (month: string) =>
        new Date(`${month}-01T00:00:00`).toLocaleDateString("pt-PT", {
          month: "short",
          year: "2-digit",
        });
      const historyMonths = months.slice(-6);
      const forecastBase =
        historyMonths.length > 0
          ? historyMonths.reduce((sum, month) => sum + (billedByMonth.get(month) ?? 0), 0) /
            historyMonths.length
          : 0;
      const forecastFactor = collectionRate !== null ? collectionRate / 100 : 0.8;
      const lastMonth = historyMonths.at(-1) ?? today.slice(0, 7);
      const futureMonths: string[] = [];
      for (let index = 1; index <= 3; index += 1) {
        const reference = new Date(`${lastMonth}-01T00:00:00`);
        reference.setMonth(reference.getMonth() + index);
        futureMonths.push(reference.toISOString().slice(0, 7));
      }

      const channelTotals = new Map<string, number>();
      for (const receipt of receipts ?? []) {
        if (receipt.status === "reversed") continue;
        const channel = String(receipt.payment_method ?? "").trim();
        if (!channel) continue;
        channelTotals.set(channel, (channelTotals.get(channel) ?? 0) + 1);
      }
      const channelLabels: Record<string, string> = {
        cash: "Dinheiro",
        transfer: "Transferência bancária",
        bank_transfer: "Transferência bancária",
        multicaixa: "Multicaixa",
        express: "Multicaixa Express",
        tpa: "TPA",
        deposit: "Depósito bancário",
        other: "Outro",
      };
      const topChannel = [...channelTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      overview.cashFlowForecast = {
        months: [
          ...historyMonths.map((month) => ({
            month: monthLabel(month),
            expectedAmount: billedByMonth.get(month) ?? 0,
            actualAmount: receivedByMonth.get(month) ?? 0,
            forecastAmount: Math.round((billedByMonth.get(month) ?? 0) * forecastFactor),
          })),
          ...futureMonths.map((month) => ({
            month: monthLabel(month),
            expectedAmount: Math.round(forecastBase),
            actualAmount: 0,
            forecastAmount: Math.round(forecastBase * forecastFactor),
          })),
        ],
        averageCollectionRate: collectionRate,
        forecastDefaultRate:
          collectionRate !== null ? Math.round((100 - collectionRate) * 10) / 10 : null,
        mainPaymentChannel: topChannel ? (channelLabels[topChannel] ?? topChannel) : null,
      };
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
      .from("school_announcements")
      .select("id, title, body, published_at, scheduled_for, created_at, status")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .or(`status.eq.sent,and(status.eq.scheduled,scheduled_for.lte.${fromDate})`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!announcementError) {
      overview.announcements = (announcementRows ?? []).map((row) => ({
        id: String(row.id),
        title: String(row.title ?? "Comunicado"),
        body: String(row.body ?? ""),
        published_at: row.published_at
          ? String(row.published_at)
          : row.scheduled_for
            ? String(row.scheduled_for)
            : null,
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
          // `audit_logs.id` é bigint na produção, não uuid. A anotação dizia
          // `string` e ninguém reparou porque o cliente privilegiado não tem
          // tipos; o `String(row.id)` abaixo já tratava o valor correctamente.
          (row: { id: number; action: string; entity_type: string; occurred_at: string }) => {
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
            "id, module, file_name, status, total_rows, inserted_rows, invalid_rows, created_at",
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
            (total, row) => total + Number(row.inserted_rows ?? 0),
            0,
          );
          overview.imports.recent = rows.slice(0, 5).map((row) => ({
            id: String(row.id),
            module: String(row.module ?? "—"),
            fileName: row.file_name ? String(row.file_name) : null,
            status: String(row.status ?? "—"),
            totalRows: Number(row.total_rows ?? 0),
            importedRows: Number(row.inserted_rows ?? 0),
            errorRows: Number(row.invalid_rows ?? 0),
            createdAt: row.created_at ? String(row.created_at) : null,
          }));
        }
      } catch {
        /* motor de importação indisponível: o painel continua */
      }
    }

    return overview;
  });

export const getSchoolTodayOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SchoolTodayOps> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    const today = todayInLuanda();
    if (!membership) return emptySchoolTodayOps(today);

    const role = membership.appRole;
    if (!["Administrador", "Secretaria", "Tesouraria", "Professor"].includes(role)) {
      return emptySchoolTodayOps(today);
    }

    const db = context.supabase;
    const schoolId = membership.schoolId;
    const ops = emptySchoolTodayOps(today);
    const weekday = weekdayJsFromIso(today);
    ops.weekday = weekday;
    const nowHhMm = nowTimeInLuanda();

    try {
      const { data: slots } = await db
        .from("timetable_slots")
        .select("id, class_subject_id, starts_at, ends_at, room")
        .eq("school_id", schoolId)
        .eq("weekday", weekday)
        .eq("status", "active");

      const slotRows = slots ?? [];
      ops.lessonsScheduled = slotRows.length;
      ops.lessonsStartingSoon = slotRows.filter((slot) =>
        isStartingWithinMinutes(String(slot.starts_at ?? ""), nowHhMm, 30),
      ).length;
      ops.roomsInUse = new Set(
        slotRows
          .map((slot) =>
            String(slot.room ?? "")
              .trim()
              .toLocaleLowerCase(),
          )
          .filter(Boolean),
      ).size;

      const classSubjectIds = [
        ...new Set(slotRows.map((slot) => String(slot.class_subject_id)).filter(Boolean)),
      ];
      if (classSubjectIds.length) {
        const { data: classSubjects } = await db
          .from("class_subjects")
          .select("id, class_group_id, teacher_id")
          .eq("school_id", schoolId)
          .in("id", classSubjectIds);
        const teachers = new Set(
          (classSubjects ?? [])
            .map((row) => (row.teacher_id ? String(row.teacher_id) : ""))
            .filter(Boolean),
        );
        const classes = new Set(
          (classSubjects ?? []).map((row) => String(row.class_group_id)).filter(Boolean),
        );
        ops.teachersScheduled = teachers.size;
        ops.classesWithLessons = classes.size;
      }
    } catch {
      /* horário indisponível */
    }

    try {
      const { data: sessions } = await db
        .from("siga_attendance_sessions")
        .select("id, status")
        .eq("school_id", schoolId)
        .eq("lesson_date", today);
      for (const session of sessions ?? []) {
        const status = String(session.status ?? "");
        if (status === "completed") ops.attendanceSessionsDone += 1;
        else if (status !== "cancelled") ops.attendanceSessionsOpen += 1;
      }
    } catch {
      /* chamadas indisponíveis */
    }

    try {
      const { data: occurrences } = await db
        .from("hr_teacher_lesson_occurrences")
        .select("id, teacher_id, actual_started_at, status")
        .eq("school_id", schoolId)
        .eq("lesson_date", today);
      const checked = new Set<string>();
      const pending = new Set<string>();
      for (const row of occurrences ?? []) {
        const teacherId = row.teacher_id ? String(row.teacher_id) : "";
        if (!teacherId) continue;
        if (row.actual_started_at) checked.add(teacherId);
        else if (String(row.status ?? "") !== "cancelled") pending.add(teacherId);
      }
      for (const id of checked) pending.delete(id);
      ops.teachersCheckedIn = checked.size;
      ops.teachersPendingCheckIn = pending.size;
    } catch {
      /* RH opcional */
    }

    try {
      const mmDd = today.slice(5);
      // A coluna é `date_of_birth`. O código pedia `birth_date`, que não existe
      // em `people`: o PostgREST devolvia erro, o `catch` abaixo engolia-o, e o
      // cartão «aniversários hoje» mostrava zero desde sempre. Só apareceu
      // quando esta leitura passou a ser tipada — com o cliente privilegiado,
      // que não tem tipos, um nome de coluna errado é indistinguível de um dia
      // sem aniversários.
      const { data: people } = await db
        .from("people")
        .select("id, date_of_birth")
        .eq("school_id", schoolId)
        .not("date_of_birth", "is", null)
        .limit(2000);
      ops.birthdaysToday = (people ?? []).filter(
        (person) => String(person.date_of_birth ?? "").slice(5, 10) === mmDd,
      ).length;
    } catch {
      /* aniversários opcionais */
    }

    if (["Administrador", "Tesouraria"].includes(role)) {
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
        let overdueCount = 0;
        for (const invoice of invoices ?? []) {
          if (invoice.status === "cancelled") continue;
          const total = Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0);
          const paid = paidByInvoice.get(String(invoice.id)) ?? 0;
          const openAmount = Math.max(total - paid, 0);
          if (openAmount > 0 && String(invoice.due_date ?? "") < today) overdueCount += 1;
        }
        ops.overdueInvoices = overdueCount;
      } catch {
        /* financeiro opcional */
      }
    }

    try {
      const { data: terms } = await db
        .from("terms")
        .select("id, name, starts_on, ends_on")
        .eq("school_id", schoolId)
        .lte("starts_on", today)
        .gte("ends_on", today);
      ops.calendarItemsToday = (terms ?? []).length;
    } catch {
      /* calendário opcional */
    }

    return ops;
  });

export const listSchoolAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [] as SchoolAlert[];
    const db = context.supabase;
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
            .neq("status", "cancelled")
            .limit(5000),
          db
            .from("finance_receipts")
            .select("invoice_id, amount, status")
            .eq("school_id", schoolId)
            .limit(5000),
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
