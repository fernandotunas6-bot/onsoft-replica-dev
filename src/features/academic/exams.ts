/**
 * Recuperação, exames e resultado final (servidor).
 *
 * Épocas de exame por ano lectivo, inscrição dos elegíveis a partir da pauta
 * anual (homologada, publicada ou fechada), lançamento das notas e a situação
 * final recalculada pela regra de avaliação com que a pauta foi gerada.
 * Tabelas só do servidor: lê e escreve com a chave de serviço depois de
 * validar o perfil (Administrador/Secretaria gerem; Professor consulta).
 */
import type { TablesInsert } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import {
  EXAM_KINDS,
  EXAM_KIND_LABELS,
  EXAM_RESULT_METHODS,
  EXAM_SESSION_STATUSES,
  applyExamResults,
  averageAfterExam,
  computeFinalResult,
  examEligibility,
  subjectFinalsFromBreakdown,
  subjectsBeforeSession,
  type EngineRule,
  type Eligibility,
  type ExamKind,
  type ExamResultMethod,
  type ExamSessionStatus,
  type FinalResult,
  type RegistrationStatus,
  type SubjectFinal,
} from "./exam-engine";
import { notifyAfterAction } from "./lesson-delivery";
import {
  OFFICIAL_SHEET_STATUSES,
  activeYearId,
  examDbError,
  loadAnnualSheet,
  loadEngineRule,
  studentNames,
} from "./exam-data";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

const READ_ROLES = ["Administrador", "Secretaria", "Professor"] as const;
const MANAGE_ROLES = ["Administrador", "Secretaria"] as const;

export type ExamSession = {
  id: string;
  kind: ExamKind;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  maxFailedSubjects: number | null;
  resultMethod: ExamResultMethod;
  status: ExamSessionStatus;
  registrations: number;
  graded: number;
};

export type ExamBoard = {
  yearId: string | null;
  sessions: ExamSession[];
  classGroups: Array<{ id: string; name: string; annualSheetStatus: string | null }>;
  canManage: boolean;
};

export const getExamBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ academicYearId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ExamBoard> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const canManage = membership.allAppRoles.some((r) =>
      (MANAGE_ROLES as readonly string[]).includes(r),
    );
    const yearId = await activeYearId(db, schoolId, data.academicYearId);
    if (!yearId) return { yearId: null, sessions: [], classGroups: [], canManage };

    const [sessionsRes, groupsRes, sheetsRes] = await Promise.all([
      db
        .from("siga_exam_sessions")
        .select(
          "id, kind, name, starts_on, ends_on, max_failed_subjects, result_method, status, created_at",
        )
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .order("created_at", { ascending: false }),
      db
        .from("class_groups")
        .select("id, name")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .order("name"),
      db
        .from("grade_sheets")
        .select("class_group_id, status")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .eq("kind", "annual"),
    ]);
    if (sessionsRes.error) {
      throw examDbError(sessionsRes.error, "Não foi possível ler as épocas de exame.");
    }
    const sessionRows = (sessionsRes.data ?? []) as Row[];
    const sessionIds = sessionRows.map((s) => str(s.id));
    const { data: regs } = sessionIds.length
      ? await db
          .from("siga_exam_registrations")
          .select("session_id, status")
          .eq("school_id", schoolId)
          .in("session_id", sessionIds)
      : { data: [] as Row[] };
    const counts = new Map<string, { total: number; graded: number }>();
    for (const r of (regs ?? []) as Row[]) {
      if (str(r.status) === "cancelled") continue;
      const c = counts.get(str(r.session_id)) ?? { total: 0, graded: 0 };
      c.total += 1;
      if (str(r.status) === "graded" || str(r.status) === "absent") c.graded += 1;
      counts.set(str(r.session_id), c);
    }
    const sheetStatus = new Map(
      ((sheetsRes.data ?? []) as Row[]).map((s) => [str(s.class_group_id), str(s.status)]),
    );

    return {
      yearId,
      canManage,
      sessions: sessionRows.map((s) => ({
        id: str(s.id),
        kind: str(s.kind) as ExamKind,
        name: str(s.name),
        startsOn: s.starts_on ? str(s.starts_on) : null,
        endsOn: s.ends_on ? str(s.ends_on) : null,
        maxFailedSubjects: numOrNull(s.max_failed_subjects),
        resultMethod: str(s.result_method) as ExamResultMethod,
        status: str(s.status) as ExamSessionStatus,
        registrations: counts.get(str(s.id))?.total ?? 0,
        graded: counts.get(str(s.id))?.graded ?? 0,
      })),
      classGroups: ((groupsRes.data ?? []) as Row[]).map((g) => ({
        id: str(g.id),
        name: str(g.name),
        annualSheetStatus: sheetStatus.get(str(g.id)) ?? null,
      })),
    };
  });

const sessionInput = z.object({
  academicYearId: z.string().uuid(),
  kind: z.enum(EXAM_KINDS),
  name: z.string().trim().min(2).max(120).optional(),
  startsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  maxFailedSubjects: z.number().int().min(1).max(30).nullable(),
  resultMethod: z.enum(EXAM_RESULT_METHODS),
});

export const createExamSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sessionInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    if (data.startsOn && data.endsOn && data.endsOn < data.startsOn) {
      throw new Error("A data de fim é anterior à de início.");
    }
    const db = await loadSgaAdminClient();
    const { data: year } = await db
      .from("academic_years")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.academicYearId)
      .maybeSingle();
    if (!year) throw new Error("Ano lectivo não encontrado nesta escola.");
    const { data: row, error } = await db
      .from("siga_exam_sessions")
      .insert({
        school_id: membership.schoolId,
        academic_year_id: data.academicYearId,
        kind: data.kind,
        name: data.name || EXAM_KIND_LABELS[data.kind],
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        max_failed_subjects: data.kind === "melhoria" ? null : data.maxFailedSubjects,
        result_method: data.resultMethod,
        status: "draft",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw examDbError(error, "Não foi possível criar a época de exames.");
    return { id: str(row.id) };
  });

export const setExamSessionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ sessionId: z.string().uuid(), status: z.enum(EXAM_SESSION_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const { error } = await db
      .from("siga_exam_sessions")
      .update({ status: data.status, updated_by: context.userId })
      .eq("school_id", membership.schoolId)
      .eq("id", data.sessionId);
    if (error) throw examDbError(error, "Não foi possível mudar o estado da época.");
    return { ok: true };
  });

type LoadedSession = {
  id: string;
  kind: ExamKind;
  name: string;
  academicYearId: string;
  maxFailedSubjects: number | null;
  resultMethod: ExamResultMethod;
  status: ExamSessionStatus;
  createdAt: string;
};

async function loadSession(db: Db, schoolId: string, sessionId: string): Promise<LoadedSession> {
  const { data, error } = await db
    .from("siga_exam_sessions")
    .select(
      "id, kind, name, academic_year_id, max_failed_subjects, result_method, status, created_at",
    )
    .eq("school_id", schoolId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw examDbError(error, "Não foi possível ler a época de exames.");
  if (!data) throw new Error("Época de exames não encontrada.");
  return {
    id: str(data.id),
    kind: str(data.kind) as ExamKind,
    name: str(data.name),
    academicYearId: str(data.academic_year_id),
    maxFailedSubjects: numOrNull(data.max_failed_subjects),
    resultMethod: str(data.result_method) as ExamResultMethod,
    status: str(data.status) as ExamSessionStatus,
    createdAt: str(data.created_at),
  };
}

/**
 * Notas das outras épocas do mesmo ano para a turma, por matrícula (ver
 * `subjectsBeforeSession`: só contam as épocas anteriores a esta).
 */
async function otherSessionResults(
  db: Db,
  schoolId: string,
  session: LoadedSession,
  classGroupId: string,
) {
  const { data: sessions, error } = await db
    .from("siga_exam_sessions")
    .select("id, created_at")
    .eq("school_id", schoolId)
    .eq("academic_year_id", session.academicYearId)
    .neq("id", session.id);
  if (error) throw examDbError(error, "Não foi possível ler as épocas de exames.");
  const sessionAt = new Map(((sessions ?? []) as Row[]).map((s) => [str(s.id), str(s.created_at)]));
  const byEnrollment = new Map<
    string,
    Array<{
      sessionId: string;
      subjectId: string;
      status: string;
      finalAverage: number | null;
      sessionCreatedAt: string;
    }>
  >();
  if (!sessionAt.size) return byEnrollment;
  const { data: regs, error: regsError } = await db
    .from("siga_exam_registrations")
    .select("session_id, enrollment_id, subject_id, status, final_average")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId)
    .in("session_id", [...sessionAt.keys()]);
  if (regsError) throw examDbError(regsError, "Não foi possível ler as inscrições anteriores.");
  for (const r of (regs ?? []) as Row[]) {
    const list = byEnrollment.get(str(r.enrollment_id)) ?? [];
    list.push({
      sessionId: str(r.session_id),
      subjectId: str(r.subject_id),
      status: str(r.status),
      finalAverage: numOrNull(r.final_average),
      sessionCreatedAt: sessionAt.get(str(r.session_id)) ?? "",
    });
    byEnrollment.set(str(r.enrollment_id), list);
  }
  return byEnrollment;
}

export type ExamRegistration = {
  id: string;
  subjectId: string;
  subjectName: string;
  originalAverage: number | null;
  score: number | null;
  finalAverage: number | null;
  examDate: string | null;
  status: RegistrationStatus;
};

export type ExamStudentLine = {
  enrollmentId: string;
  studentName: string;
  absencePercentage: number | null;
  subjects: SubjectFinal[];
  eligibility: Eligibility;
  registrations: ExamRegistration[];
  before: FinalResult;
  after: FinalResult;
};

export type ExamClassDetail = {
  session: LoadedSession;
  sheet: { id: string; status: string; official: boolean } | null;
  rule: EngineRule | null;
  students: ExamStudentLine[];
  canManage: boolean;
};

const classInput = z.object({ sessionId: z.string().uuid(), classGroupId: z.string().uuid() });

export const getExamClassDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => classInput.parse(input))
  .handler(async ({ data, context }): Promise<ExamClassDetail> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const canManage = membership.allAppRoles.some((r) =>
      (MANAGE_ROLES as readonly string[]).includes(r),
    );
    const session = await loadSession(db, schoolId, data.sessionId);
    const sheet = await loadAnnualSheet(db, schoolId, session.academicYearId, data.classGroupId);
    if (!sheet || !sheet.rule) {
      return {
        session,
        sheet: sheet ? { id: sheet.id, status: sheet.status, official: false } : null,
        rule: null,
        students: [],
        canManage,
      };
    }
    const rule = sheet.rule;
    const { data: regs, error } = await db
      .from("siga_exam_registrations")
      .select(
        "id, enrollment_id, subject_id, original_average, score, final_average, exam_date, status",
      )
      .eq("school_id", schoolId)
      .eq("session_id", session.id)
      .eq("class_group_id", data.classGroupId);
    if (error) throw examDbError(error, "Não foi possível ler as inscrições.");
    const [names, earlier] = await Promise.all([
      studentNames(
        db,
        schoolId,
        sheet.rows.map((r) => r.enrollmentId),
      ),
      otherSessionResults(db, schoolId, session, data.classGroupId),
    ]);

    const students = sheet.rows.map((row): ExamStudentLine => {
      const subjects = subjectsBeforeSession(
        subjectFinalsFromBreakdown(row.breakdown, rule),
        earlier.get(row.enrollmentId) ?? [],
        session,
      );
      const subjectName = new Map(subjects.map((s) => [s.subjectId, s.subjectName]));
      const registrations = ((regs ?? []) as Row[])
        .filter((r) => str(r.enrollment_id) === row.enrollmentId)
        .map((r) => ({
          id: str(r.id),
          subjectId: str(r.subject_id),
          subjectName: subjectName.get(str(r.subject_id)) ?? "Disciplina",
          originalAverage: numOrNull(r.original_average),
          score: numOrNull(r.score),
          finalAverage: numOrNull(r.final_average),
          examDate: r.exam_date ? str(r.exam_date) : null,
          status: str(r.status) as RegistrationStatus,
        }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt"));
      const graded = registrations
        .filter((r) => r.status === "graded" && r.finalAverage != null)
        .map((r) => ({ subjectId: r.subjectId, finalAverage: r.finalAverage! }));
      return {
        enrollmentId: row.enrollmentId,
        studentName: names.get(row.enrollmentId)?.name ?? "Aluno",
        absencePercentage: row.absencePercentage,
        subjects,
        eligibility: examEligibility(
          { subjects, absencePercentage: row.absencePercentage },
          rule,
          session,
        ),
        registrations,
        before: computeFinalResult(subjects, row.absencePercentage, rule),
        after: computeFinalResult(applyExamResults(subjects, graded), row.absencePercentage, rule),
      };
    });
    students.sort((a, b) => a.studentName.localeCompare(b.studentName, "pt"));

    return {
      session,
      sheet: {
        id: sheet.id,
        status: sheet.status,
        official: OFFICIAL_SHEET_STATUSES.includes(sheet.status),
      },
      rule,
      students,
      canManage,
    };
  });

/** Inscreve todos os elegíveis da turma (não duplica quem já está inscrito). */
export const registerEligibleStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => classInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const session = await loadSession(db, schoolId, data.sessionId);
    if (session.status === "closed") throw new Error("Esta época já está fechada.");
    const sheet = await loadAnnualSheet(db, schoolId, session.academicYearId, data.classGroupId);
    if (!sheet || !OFFICIAL_SHEET_STATUSES.includes(sheet.status)) {
      throw new Error("A pauta anual da turma tem de estar homologada antes das inscrições.");
    }
    if (!sheet.rule) throw new Error("A pauta anual não tem regra de avaliação.");
    const rule = sheet.rule;
    const earlier = await otherSessionResults(db, schoolId, session, data.classGroupId);

    const rows: TablesInsert<"siga_exam_registrations">[] = [];
    const registeredByEnrollment = new Map<string, string[]>();
    for (const line of sheet.rows) {
      const subjects = subjectsBeforeSession(
        subjectFinalsFromBreakdown(line.breakdown, rule),
        earlier.get(line.enrollmentId) ?? [],
        session,
      );
      const eligibility = examEligibility(
        { subjects, absencePercentage: line.absencePercentage },
        rule,
        session,
      );
      if (!eligibility.eligible) continue;
      for (const subject of eligibility.subjects) {
        rows.push({
          school_id: schoolId,
          session_id: session.id,
          enrollment_id: line.enrollmentId,
          subject_id: subject.subjectId,
          class_group_id: data.classGroupId,
          grade_sheet_id: sheet.id,
          original_average: subject.average,
          status: "registered",
          created_by: context.userId,
          updated_by: context.userId,
        });
        const list = registeredByEnrollment.get(line.enrollmentId) ?? [];
        list.push(subject.subjectName);
        registeredByEnrollment.set(line.enrollmentId, list);
      }
    }
    if (!rows.length) return { registered: 0, notified: 0 };

    const { data: inserted, error } = await db
      .from("siga_exam_registrations")
      .upsert(rows, { onConflict: "session_id,enrollment_id,subject_id", ignoreDuplicates: true })
      .select("enrollment_id, subject_id");
    if (error) throw examDbError(error, "Não foi possível inscrever os alunos.");

    // Avisar só quem foi inscrito agora (aluno e encarregados).
    const newEnrollments = [
      ...new Set(((inserted ?? []) as Row[]).map((r) => str(r.enrollment_id))),
    ];
    const notified = await notifyRegistered(
      db,
      schoolId,
      session,
      newEnrollments.map((id) => ({
        enrollmentId: id,
        subjects: registeredByEnrollment.get(id) ?? [],
      })),
    );
    return { registered: (inserted ?? []).length, notified };
  });

async function notifyRegistered(
  db: Db,
  schoolId: string,
  session: LoadedSession,
  items: Array<{ enrollmentId: string; subjects: string[] }>,
) {
  if (!items.length) return 0;
  const names = await studentNames(
    db,
    schoolId,
    items.map((i) => i.enrollmentId),
  );
  const studentIds = [...names.values()].map((n) => n.studentId);
  const { data: links } = studentIds.length
    ? await db
        .from("student_guardians")
        .select("student_id, guardian_person_id")
        .eq("school_id", schoolId)
        .in("student_id", studentIds)
    : { data: [] as Row[] };
  const personIds = [
    ...[...names.values()].map((n) => n.personId),
    ...((links ?? []) as Row[]).map((l) => str(l.guardian_person_id)),
  ].filter(Boolean);
  const { data: people } = personIds.length
    ? await db.from("people").select("id, user_id").eq("school_id", schoolId).in("id", personIds)
    : { data: [] as Row[] };
  const userOf = new Map(((people ?? []) as Row[]).map((p) => [str(p.id), str(p.user_id)]));

  const rows: Array<{ userId: string; title: string; body: string; eventType: string }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    const who = names.get(item.enrollmentId);
    if (!who) continue;
    const subjects = item.subjects.join(", ");
    const title = `${session.name}: inscrição`;
    const recipients = [
      { userId: userOf.get(who.personId), body: `Está inscrito em: ${subjects}.` },
      ...((links ?? []) as Row[])
        .filter((l) => str(l.student_id) === who.studentId)
        .map((l) => ({
          userId: userOf.get(str(l.guardian_person_id)),
          body: `${who.name} está inscrito em: ${subjects}.`,
        })),
    ];
    for (const r of recipients) {
      if (!r.userId || seen.has(`${r.userId}:${item.enrollmentId}`)) continue;
      seen.add(`${r.userId}:${item.enrollmentId}`);
      rows.push({ userId: r.userId, title, body: r.body, eventType: "exam.registered" });
    }
  }
  return notifyAfterAction(db, schoolId, rows, "exam.registered");
}

const scoresInput = z.object({
  sessionId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        registrationId: z.string().uuid(),
        score: z.number().min(0).max(100).nullable(),
        absent: z.boolean(),
        examDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      }),
    )
    .min(1)
    .max(500),
});

/** Lança as notas dos exames; a média final é calculada aqui, nunca no cliente. */
export const saveExamScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => scoresInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const session = await loadSession(db, schoolId, data.sessionId);
    if (session.status !== "open") {
      throw new Error("Só se lançam notas com a época aberta.");
    }
    const ids = data.entries.map((e) => e.registrationId);
    // Linha completa: o upsert por id verifica NOT NULL antes de ver o conflito.
    const { data: regs, error } = await db
      .from("siga_exam_registrations")
      .select(
        "id, school_id, session_id, enrollment_id, subject_id, class_group_id, grade_sheet_id, original_average, exam_date, status, created_by",
      )
      .eq("school_id", schoolId)
      .eq("session_id", session.id)
      .in("id", ids);
    if (error) throw examDbError(error, "Não foi possível ler as inscrições.");
    const byId = new Map(((regs ?? []) as Row[]).map((r) => [str(r.id), r]));

    const { data: scale } = await db
      .from("grading_scales")
      .select("minimum_value, maximum_value")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!scale) throw new Error("A escola não tem escala de notas activa.");
    const min = Number(scale.minimum_value);
    const max = Number(scale.maximum_value);

    const entries = data.entries.filter((entry) => {
      const reg = byId.get(entry.registrationId);
      return reg && str(reg.status) !== "cancelled";
    });
    for (const entry of entries) {
      if (!entry.absent && entry.score != null && (entry.score < min || entry.score > max)) {
        throw new Error(`A nota do exame fica entre ${min} e ${max}.`);
      }
    }

    // Regras das pautas envolvidas: uma leitura das pautas e uma por regra.
    const sheetIds = [
      ...new Set(entries.map((e) => str(byId.get(e.registrationId)!.grade_sheet_id))),
    ].filter(Boolean);
    const { data: sheets, error: sheetsError } = sheetIds.length
      ? await db
          .from("grade_sheets")
          .select("id, rule_set_id")
          .eq("school_id", schoolId)
          .in("id", sheetIds)
      : { data: [], error: null };
    if (sheetsError) throw examDbError(sheetsError, "Não foi possível ler as pautas.");
    const ruleSetOf = new Map(
      ((sheets ?? []) as Row[]).map((s) => [str(s.id), s.rule_set_id ? str(s.rule_set_id) : null]),
    );
    const rulesBySet = new Map<string, EngineRule | null>();
    const ruleFor = async (sheetId: string) => {
      const ruleSetId = ruleSetOf.get(sheetId) ?? null;
      const key = ruleSetId ?? "";
      if (!rulesBySet.has(key)) rulesBySet.set(key, await loadEngineRule(db, schoolId, ruleSetId));
      return rulesBySet.get(key);
    };

    // Tudo calculado e validado antes de escrever: ou gravam todas, ou nenhuma.
    const rows: Row[] = [];
    for (const entry of entries) {
      const reg = byId.get(entry.registrationId)!;
      let update: Row;
      if (entry.absent) {
        update = { status: "absent", score: null, final_average: null };
      } else if (entry.score == null) {
        update = { status: "registered", score: null, final_average: null };
      } else {
        const rule = await ruleFor(str(reg.grade_sheet_id));
        if (!rule) throw new Error("Sem regra de avaliação para calcular a média.");
        update = {
          status: "graded",
          score: entry.score,
          final_average: averageAfterExam(
            numOrNull(reg.original_average),
            entry.score,
            session.resultMethod,
            rule,
            session.kind,
          ),
        };
      }
      rows.push({
        ...reg,
        ...update,
        exam_date: entry.examDate !== undefined ? entry.examDate : (reg.exam_date ?? null),
        updated_by: context.userId,
      });
    }
    if (rows.length) {
      const { error: upErr } = await db
        .from("siga_exam_registrations")
        .upsert(rows as unknown as TablesInsert<"siga_exam_registrations">[], {
          onConflict: "id",
        });
      if (upErr) throw examDbError(upErr, "Não foi possível gravar a nota do exame.");
    }
    return { saved: rows.length };
  });

export const cancelExamRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ registrationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const { error } = await db
      .from("siga_exam_registrations")
      .update({ status: "cancelled", score: null, final_average: null, updated_by: context.userId })
      .eq("school_id", membership.schoolId)
      .eq("id", data.registrationId);
    if (error) throw examDbError(error, "Não foi possível anular a inscrição.");
    return { ok: true };
  });
