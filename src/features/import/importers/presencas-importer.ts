import { normalizeDate, normalizeText, valueOf } from "../engine/normalize";
import type { AuditEntry, ImportRefCache, RowImporter } from "../engine/types";
import {
  loadClassGroupRefs,
  loadStudentRefs,
  loadSubjectRefs,
  resolveClassGroup,
  resolveStudent,
  resolveSubject,
  studentIdentifierOf,
  type ClassGroupRef,
  type StudentRef,
  type SubjectRef,
} from "./academic-core";

type AttendanceCache = ImportRefCache & {
  academicYearId: string | null;
  students: StudentRef[];
  groups: ClassGroupRef[];
  subjects: SubjectRef[];
};

const STATUS_VALUES = [
  "present",
  "absent",
  "excused",
  "late",
  "early_exit",
  "not_registered",
] as const;
type AttendanceStatus = (typeof STATUS_VALUES)[number];

function parseStatus(value: unknown): AttendanceStatus | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (["present", "presente", "p", "compareceu"].includes(text)) return "present";
  if (["absent", "ausente", "a", "falta"].includes(text)) return "absent";
  if (["excused", "justificada", "justificado", "justific", "j"].includes(text)) return "excused";
  if (["late", "atrasado", "atraso"].includes(text)) return "late";
  if (["early_exit", "saida_antecipada", "saída antecipada"].includes(text)) return "early_exit";
  if (["not_registered", "nao_registado", "não registado", "nr"].includes(text))
    return "not_registered";
  return null;
}

export const presencasImporter: RowImporter = {
  module: "presencas",

  async loadRefCache(ctx) {
    const [students, groups, subjects] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      loadClassGroupRefs(ctx.db, ctx.schoolId, ctx.academicYearId),
      loadSubjectRefs(ctx.db, ctx.schoolId),
    ]);

    return {
      existingPeople: [],
      classGroups: groups.map((g) => ({ id: g.id, name: g.name })),
      studentByPersonId: new Map(),
      academicYearId: ctx.academicYearId,
      students,
      groups,
      subjects,
    } as AttendanceCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as AttendanceCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!cache.academicYearId) {
      errors.push("Seleccione o ano lectivo antes de importar presenças.");
    }

    const identifier = studentIdentifierOf(normalized);
    const groupValue = valueOf(normalized, "class_group", "turma", "codigo_turma");
    const subjectValue = valueOf(normalized, "subject", "disciplina", "materia");
    const attendanceDate = normalizeDate(
      valueOf(normalized, "attendance_date", "data_presenca", "data", "data_aula"),
    );
    const status = parseStatus(valueOf(normalized, "status", "estado", "presenca"));

    if (!identifier) errors.push("Identificador do aluno é obrigatório.");
    if (!groupValue) errors.push("Turma é obrigatória para registar a presença.");
    if (!subjectValue) errors.push("Disciplina é obrigatória para registar a presença.");
    if (!attendanceDate) errors.push("Data da presença é obrigatória e deve ser válida.");
    if (!status)
      errors.push(
        "Estado de presença inválido. Use presente, ausente, justificada, atrasado ou saída antecipada.",
      );

    const student = resolveStudent(identifier, cache.students);
    if (student.ambiguous)
      errors.push(`Identificador "${identifier}" é ambíguo; use o nº de processo exacto.`);
    else if (identifier && !student.row)
      errors.push(`Aluno "${identifier}" não encontrado nesta escola.`);

    const group = resolveClassGroup(groupValue, cache.groups);
    if (group.ambiguous)
      errors.push(`Turma "${normalizeText(groupValue)}" é ambígua; use o código exacto.`);
    else if (groupValue && !group.row)
      errors.push(`Turma "${normalizeText(groupValue)}" não encontrada.`);

    const subject = resolveSubject(subjectValue, cache.subjects);
    if (subject.ambiguous)
      errors.push(`Disciplina "${normalizeText(subjectValue)}" é ambígua; use o código exacto.`);
    else if (subjectValue && !subject.row)
      errors.push(`Disciplina "${normalizeText(subjectValue)}" não encontrada.`);

    if (errors.length) return { status: "error", warnings, errors };

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as AttendanceCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const identifier = studentIdentifierOf(normalized);
    const groupValue = valueOf(normalized, "class_group", "turma", "codigo_turma");
    const subjectValue = valueOf(normalized, "subject", "disciplina", "materia");
    const attendanceDate = normalizeDate(
      valueOf(normalized, "attendance_date", "data_presenca", "data", "data_aula"),
    )!;
    const status = parseStatus(valueOf(normalized, "status", "estado", "presenca"))!;
    const reason = normalizeText(
      valueOf(
        normalized,
        "reason",
        "motivo",
        "justificacao",
        "justificação",
        "observacao",
        "observação",
      ),
    );
    const timetableSlotId =
      normalizeText(valueOf(normalized, "timetable_slot_id", "slot_id", "horario_id")) || null;
    const periodRaw = Number(valueOf(normalized, "period_number", "periodo", "período"));
    const periodNumber = Number.isInteger(periodRaw) && periodRaw > 0 ? periodRaw : null;

    const student = resolveStudent(identifier, cache.students).row!;
    const group = resolveClassGroup(groupValue, cache.groups).row!;
    const subject = resolveSubject(subjectValue, cache.subjects).row!;

    const { data: enrollment, error: enrollmentError } = await ctx.db
      .from("enrollments")
      .select("id")
      .eq("school_id", ctx.schoolId)
      .eq("student_id", student.id)
      .eq("class_group_id", group.id)
      .eq("academic_year_id", ctx.academicYearId ?? "")
      .in("status", ["active", "pending"])
      .limit(1)
      .maybeSingle();

    if (enrollmentError) {
      return {
        status: "error",
        warnings: [],
        errors: [`Não foi possível resolver a matrícula: ${enrollmentError.message}`],
        audits: [],
      };
    }
    if (!enrollment) {
      return {
        status: "error",
        warnings: [],
        errors: ["O aluno não possui matrícula nessa turma/ano lectivo."],
        audits: [],
      };
    }

    const { data: classSubject, error: classSubjectError } = await ctx.db
      .from("class_subjects")
      .select("id, teacher_id")
      .eq("school_id", ctx.schoolId)
      .eq("class_group_id", group.id)
      .eq("subject_id", subject.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (classSubjectError || !classSubject) {
      return {
        status: "error",
        warnings: [],
        errors: [
          classSubjectError
            ? `Não foi possível resolver a disciplina da turma: ${classSubjectError.message}`
            : "A disciplina não está atribuída à turma.",
        ],
        audits: [],
      };
    }

    let sessionQuery = ctx.db
      .from("siga_attendance_sessions")
      .select("id, status, timetable_slot_id, period_number")
      .eq("school_id", ctx.schoolId)
      .eq("class_group_id", group.id)
      .eq("subject_id", subject.id)
      .eq("lesson_date", attendanceDate);
    if (timetableSlotId) sessionQuery = sessionQuery.eq("timetable_slot_id", timetableSlotId);
    if (periodNumber) sessionQuery = sessionQuery.eq("period_number", periodNumber);
    const { data: sessionCandidates, error: sessionLookupError } = await sessionQuery.order(
      "created_at",
      { ascending: true },
    );

    if (sessionLookupError) {
      return {
        status: "error",
        warnings: [],
        errors: [`Não foi possível resolver a sessão de presença: ${sessionLookupError.message}`],
        audits: [],
      };
    }
    if (!timetableSlotId && !periodNumber && (sessionCandidates ?? []).length > 1) {
      return {
        status: "error",
        warnings: [],
        errors: [
          "Existem várias sessões para a mesma turma/disciplina/data; informe timetable_slot_id ou period_number para evitar misturar presenças.",
        ],
        audits: [],
      };
    }

    const existingSession = sessionCandidates?.[0] ?? null;
    let sessionId = existingSession?.id ? String(existingSession.id) : null;
    const audits: AuditEntry[] = [];

    if (!sessionId) {
      if (ctx.dryRun) {
        return {
          status: "will_insert",
          warnings: ["Será criada uma sessão de presença para a data/turma/disciplina indicada."],
          errors: [],
          audits: [],
          target_record_id: null,
        };
      }

      const { data: session, error: sessionError } = await ctx.db
        .from("siga_attendance_sessions")
        .insert({
          school_id: ctx.schoolId,
          academic_year_id: ctx.academicYearId ?? null,
          class_group_id: group.id,
          subject_id: subject.id,
          teacher_id: classSubject.teacher_id ?? null,
          lesson_date: attendanceDate,
          timetable_slot_id: timetableSlotId,
          period_number: periodNumber,
          status: "pending",
          created_by: ctx.userId,
          updated_by: ctx.userId,
        })
        .select("id")
        .single();

      if (sessionError || !session) {
        return {
          status: "error",
          warnings: [],
          errors: [
            `Não foi possível criar a sessão de presença: ${sessionError?.message ?? "erro desconhecido"}`,
          ],
          audits: [],
        };
      }

      sessionId = String(session.id);
      audits.push({
        table_name: "siga_attendance_sessions",
        target_id: sessionId,
        action_type: "inserted",
        after_data: {
          school_id: ctx.schoolId,
          academic_year_id: ctx.academicYearId ?? null,
          class_group_id: group.id,
          subject_id: subject.id,
          teacher_id: classSubject.teacher_id ?? null,
          lesson_date: attendanceDate,
          timetable_slot_id: timetableSlotId,
          period_number: periodNumber,
          status: "pending",
        },
      });
    }

    const { data: existingRecord, error: recordLookupError } = await ctx.db
      .from("siga_attendance_records")
      .select("id, status, notes")
      .eq("school_id", ctx.schoolId)
      .eq("session_id", sessionId)
      .eq("student_id", student.id)
      .maybeSingle();

    if (recordLookupError) {
      return {
        status: "error",
        warnings: [],
        errors: [`Não foi possível verificar a presença existente: ${recordLookupError.message}`],
        audits,
      };
    }

    if (existingRecord && ctx.duplicateStrategy === "ignore") {
      return {
        status: "ignored",
        warnings: ["Presença existente ignorada conforme a estratégia escolhida."],
        errors: [],
        audits,
        target_record_id: String(existingRecord.id),
      };
    }
    if (existingRecord && ctx.duplicateStrategy === "create_new") {
      return {
        status: "error",
        warnings: [],
        errors: ["Já existe um registo de presença para este aluno nesta sessão."],
        audits,
        target_record_id: String(existingRecord.id),
      };
    }
    if (ctx.dryRun) {
      return {
        status: existingRecord ? "will_update" : "will_insert",
        warnings: [],
        errors: [],
        audits: [],
        target_record_id: existingRecord ? String(existingRecord.id) : null,
      };
    }

    if (existingRecord) {
      const before = { ...existingRecord };
      const { data: updated, error } = await ctx.db
        .from("siga_attendance_records")
        .update({
          status,
          notes: reason || null,
          recorded_by: ctx.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRecord.id)
        .eq("school_id", ctx.schoolId)
        .select("id, status, notes")
        .single();

      if (error || !updated) {
        return {
          status: "error",
          warnings: [],
          errors: [
            `Não foi possível actualizar a presença: ${error?.message ?? "registo não encontrado"}`,
          ],
          audits,
        };
      }

      audits.push({
        table_name: "siga_attendance_records",
        target_id: String(updated.id),
        action_type: "updated",
        before_data: before,
        after_data: updated,
      });
      return {
        status: "imported",
        warnings: [],
        errors: [],
        audits,
        target_record_id: String(updated.id),
      };
    }

    const { data: created, error } = await ctx.db
      .from("siga_attendance_records")
      .insert({
        school_id: ctx.schoolId,
        session_id: sessionId,
        student_id: student.id,
        status,
        notes: reason || null,
        recorded_by: ctx.userId,
      })
      .select("id, status, notes")
      .single();

    if (error || !created) {
      return {
        status: "error",
        warnings: [],
        errors: [`Não foi possível registar a presença: ${error?.message ?? "erro desconhecido"}`],
        audits,
      };
    }

    audits.push({
      table_name: "siga_attendance_records",
      target_id: String(created.id),
      action_type: "inserted",
      after_data: {
        school_id: ctx.schoolId,
        session_id: sessionId,
        student_id: student.id,
        status,
        notes: reason || null,
      },
    });

    return {
      status: "imported",
      warnings: [],
      errors: [],
      audits,
      target_record_id: String(created.id),
    };
  },
};
