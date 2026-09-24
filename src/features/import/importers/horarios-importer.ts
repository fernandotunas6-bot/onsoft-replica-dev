import { normalizeText } from "../engine/normalize";
import type { AuditEntry, ImportRefCache, RowImporter } from "../engine/types";
import {
  loadClassSubjectRefs,
  loadTeacherRefs,
  uniqueExactMatch,
  type ClassSubjectRef,
  type TeacherRef,
} from "./academic-core";

type Ref = { id: string; code: string; name: string };
type ScheduledSlot = {
  classGroupId: string;
  teacherId: string | null;
  weekday: number;
  startsAt: number;
  endsAt: number;
  room: string;
};
type HorariosCache = ImportRefCache & {
  classGroups: Ref[];
  subjects: Ref[];
  teachers: TeacherRef[];
  classSubjects: ClassSubjectRef[];
  existingSlots: Set<string>; // key: `${class_subject_id}:${weekday}:${starts_at}`
  scheduledSlots: ScheduledSlot[];
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

function parseWeekday(val: unknown): number | null {
  const norm = normalizeText(val).toLowerCase();
  if (norm.includes("segunda") || norm === "1" || norm === "seg") return 1;
  if (norm.includes("terca") || norm.includes("terça") || norm === "2" || norm === "ter") return 2;
  if (norm.includes("quarta") || norm === "3" || norm === "qua") return 3;
  if (norm.includes("quinta") || norm === "4" || norm === "qui") return 4;
  if (norm.includes("sexta") || norm === "5" || norm === "sex") return 5;
  if (norm.includes("sabado") || norm.includes("sábado") || norm === "6" || norm === "sab")
    return 6;
  return null;
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function timeKey(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return normalizeText(value);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function intervalsOverlap(
  startsAt: number,
  endsAt: number,
  otherStartsAt: number,
  otherEndsAt: number,
): boolean {
  return startsAt < otherEndsAt && otherStartsAt < endsAt;
}

function classSubjectKey(classGroupId: string, subjectId: string) {
  return `${classGroupId}:${subjectId}`;
}

function resolveClassSubject(
  classGroupId: string,
  subjectId: string,
  classSubjects: ClassSubjectRef[],
): ClassSubjectRef | null {
  return (
    classSubjects.find(
      (row) => row.class_group_id === classGroupId && row.subject_id === subjectId,
    ) ?? null
  );
}

export const horariosImporter: RowImporter = {
  module: "horarios",

  async loadRefCache(ctx) {
    const [groups, subjects, teachers, classSubjects, slotRows] = await Promise.all([
      ctx.db.from("class_groups").select("id, code, name").eq("school_id", ctx.schoolId),
      ctx.db.from("subjects").select("id, code, name").eq("school_id", ctx.schoolId),
      loadTeacherRefs(ctx.db, ctx.schoolId),
      loadClassSubjectRefs(ctx.db, ctx.schoolId),
      ctx.db
        .from("timetable_slots")
        .select("class_subject_id, weekday, starts_at, ends_at, room")
        .eq("school_id", ctx.schoolId),
    ]);

    if (groups.error) throw new Error(`Não foi possível carregar turmas: ${groups.error.message}`);
    if (subjects.error)
      throw new Error(`Não foi possível carregar disciplinas: ${subjects.error.message}`);
    if (slotRows.error)
      throw new Error(`Não foi possível carregar horários: ${slotRows.error.message}`);

    const existingSlots = new Set(
      (slotRows.data ?? []).map(
        (r) => `${r.class_subject_id}:${r.weekday}:${timeKey(String(r.starts_at ?? ""))}`,
      ),
    );
    const classSubjectById = new Map(classSubjects.map((row) => [row.id, row]));
    const scheduledSlots: ScheduledSlot[] = (slotRows.data ?? []).flatMap((row) => {
      const classSubject = classSubjectById.get(String(row.class_subject_id));
      const startsAt = parseTimeToMinutes(String(row.starts_at ?? ""));
      const endsAt = parseTimeToMinutes(String(row.ends_at ?? ""));
      if (!classSubject || startsAt === null || endsAt === null || endsAt <= startsAt) return [];
      return [{
        classGroupId: classSubject.class_group_id,
        teacherId: classSubject.teacher_id,
        weekday: Number(row.weekday),
        startsAt,
        endsAt,
        room: normalizeText(row.room) || "A definir",
      }];
    });

    return {
      existingPeople: [],
      classGroups: (groups.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
      studentByPersonId: new Map(),
      subjects: (subjects.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
      teachers,
      classSubjects,
      existingSlots,
      scheduledSlots,
    } as HorariosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as HorariosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const groupVal = valueOf(normalized, "class_group", "turma", "codigo_turma");
    const subjectVal = valueOf(normalized, "subject", "disciplina", "materia");
    const teacherVal = valueOf(normalized, "teacher_identifier", "professor", "docente", "agente");
    const weekday = parseWeekday(valueOf(normalized, "weekday", "dia", "dia_semana"));
    const startTime = normalizeText(valueOf(normalized, "start_time", "inicio", "hora_inicio"));
    const endTime = normalizeText(valueOf(normalized, "end_time", "fim", "hora_fim"));

    if (!groupVal) errors.push("Turma é obrigatória.");
    if (!subjectVal) errors.push("Disciplina é obrigatória.");
    if (!weekday) errors.push("Dia da semana inválido (ex: Segunda-feira, Terça-feira...).");
    if (!startTime) errors.push("Hora de início é obrigatória (ex: 07:30).");
    if (!endTime) errors.push("Hora de fim é obrigatória (ex: 08:15).");

    const startMinutes = startTime ? parseTimeToMinutes(startTime) : null;
    const endMinutes = endTime ? parseTimeToMinutes(endTime) : null;
    if (startTime && startMinutes === null) errors.push("Hora de início inválida (use HH:MM).");
    if (endTime && endMinutes === null) errors.push("Hora de fim inválida (use HH:MM).");
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      errors.push("A hora de fim deve ser posterior à hora de início.");
    }

    if (errors.length) return { status: "error", warnings, errors };

    const groupMatch = uniqueExactMatch(groupVal, cache.classGroups, [
      (r) => r.code,
      (r) => r.name,
    ]);
    if (groupMatch.ambiguous) errors.push(`Turma "${normalizeText(groupVal)}" é ambígua.`);
    else if (!groupMatch.row)
      errors.push(`Turma "${normalizeText(groupVal)}" não encontrada nesta escola.`);

    const subjMatch = uniqueExactMatch(subjectVal, cache.subjects, [(r) => r.code, (r) => r.name]);
    if (subjMatch.ambiguous) errors.push(`Disciplina "${normalizeText(subjectVal)}" é ambígua.`);
    else if (!subjMatch.row)
      errors.push(`Disciplina "${normalizeText(subjectVal)}" não encontrada nesta escola.`);

    if (teacherVal) {
      const teacherMatch = uniqueExactMatch(teacherVal, cache.teachers, [
        (t) => t.employee_number,
        (t) => t.national_id,
      ]);
      if (teacherMatch.ambiguous) {
        errors.push(`Professor "${normalizeText(teacherVal)}" é ambíguo; use o nº de agente.`);
      } else if (!teacherMatch.row) {
        errors.push(`Professor "${normalizeText(teacherVal)}" não encontrado nesta escola.`);
      }
    }

    if (errors.length) return { status: "error", warnings, errors };

    const slotKey = `${classSubjectKey(groupMatch.row!.id, subjMatch.row!.id)}:${weekday}:${startTime}`;
    const classSubject = resolveClassSubject(
      groupMatch.row!.id,
      subjMatch.row!.id,
      cache.classSubjects,
    );
    const teacher = teacherVal
      ? uniqueExactMatch(teacherVal, cache.teachers, [
          (t) => t.employee_number,
          (t) => t.national_id,
        ]).row
      : null;
    if (teacher && classSubject?.teacher_id && classSubject.teacher_id !== teacher.id) {
      errors.push("A disciplina já está atribuída a outro professor nesta turma.");
    }
    if (errors.length) return { status: "error", warnings, errors };

    const startTimeKey = timeKey(startTime);
    if (classSubject && cache.existingSlots.has(`${classSubject.id}:${weekday}:${startTimeKey}`)) {
      return {
        status: "duplicate",
        warnings: ["Já existe uma aula agendada para esta turma neste dia e horário."],
        errors: [],
        duplicate_of: slotKey,
      };
    }

    const requestedRoom = normalizeText(valueOf(normalized, "room", "sala")) || "A definir";
    const teacherId = teacher?.id ?? classSubject?.teacher_id ?? null;
    const scheduleConflict = cache.scheduledSlots.find(
      (slot) =>
        slot.weekday === weekday &&
        intervalsOverlap(startMinutes!, endMinutes!, slot.startsAt, slot.endsAt) &&
        (slot.classGroupId === groupMatch.row!.id ||
          (teacherId !== null && slot.teacherId === teacherId) ||
          (requestedRoom !== "A definir" && slot.room === requestedRoom)),
    );
    if (scheduleConflict) {
      errors.push("Conflito de horário: turma, professor ou sala já está ocupado neste intervalo.");
      return { status: "error", warnings, errors };
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as HorariosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const groupVal = valueOf(normalized, "class_group", "turma", "codigo_turma")!;
    const subjectVal = valueOf(normalized, "subject", "disciplina", "materia")!;
    const teacherVal = valueOf(normalized, "teacher_identifier", "professor", "docente", "agente");
    const weekday = parseWeekday(valueOf(normalized, "weekday", "dia", "dia_semana"))!;
    const startTime = normalizeText(valueOf(normalized, "start_time", "inicio", "hora_inicio"))!;
    const endTime = normalizeText(valueOf(normalized, "end_time", "fim", "hora_fim"))!;
    const room = normalizeText(valueOf(normalized, "room", "sala")) || "A definir";

    const group = uniqueExactMatch(groupVal, cache.classGroups, [
      (r) => r.code,
      (r) => r.name,
    ]).row!;
    const subj = uniqueExactMatch(subjectVal, cache.subjects, [(r) => r.code, (r) => r.name]).row!;
    const teacher = teacherVal
      ? uniqueExactMatch(teacherVal, cache.teachers, [
          (t) => t.employee_number,
          (t) => t.national_id,
        ]).row
      : null;

    const existingClassSubject = resolveClassSubject(group.id, subj.id, cache.classSubjects);

    if (ctx.dryRun) {
      if (
        existingClassSubject &&
        cache.existingSlots.has(`${existingClassSubject.id}:${weekday}:${timeKey(startTime)}`)
      ) {
        return {
          status: "duplicate",
          warnings: analysis.warnings,
          errors: [],
          audits: [],
          target_record_id: `${existingClassSubject.id}:${weekday}:${timeKey(startTime)}`,
        };
      }
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: null,
      };
    }

    let classSubject = existingClassSubject;
    const audits: AuditEntry[] = [];
    if (!classSubject) {
      // Turma ainda não tem esta disciplina atribuída: cria a associação sem professor definido
      // (4 tempos semanais por omissão), o mesmo que `applyCurriculumToClassGroup` faz quando o
      // currículo é aplicado à turma pela interface. O horário é que está a fazer essa atribuição
      // aqui — o professor pode entrar já, se a linha o indicar.
      const { data, error } = await ctx.db
        .from("class_subjects")
        .insert({
          school_id: ctx.schoolId,
          class_group_id: group.id,
          subject_id: subj.id,
          teacher_id: teacher?.id ?? null,
          weekly_periods: 4,
          status: "active",
          created_by: ctx.userId,
          updated_by: ctx.userId,
        })
        .select("id, class_group_id, subject_id, teacher_id")
        .single();
      if (error) {
        return {
          status: "error",
          warnings: analysis.warnings,
          errors: [`Erro ao atribuir disciplina à turma: ${error.message}`],
          audits: [],
        };
      }
      classSubject = {
        id: String(data.id),
        class_group_id: String(data.class_group_id),
        subject_id: String(data.subject_id),
        teacher_id: data.teacher_id ? String(data.teacher_id) : null,
      };
      cache.classSubjects.push(classSubject);
      audits.push({
        table_name: "class_subjects",
        target_id: classSubject.id,
        action_type: "inserted",
        after_data: {
          school_id: ctx.schoolId,
          class_group_id: classSubject.class_group_id,
          subject_id: classSubject.subject_id,
          teacher_id: classSubject.teacher_id,
          weekly_periods: 4,
          status: "active",
        },
      });
    } else if (teacher && !classSubject.teacher_id) {
      const before = { ...classSubject };
      const { error: teacherUpdateError } = await ctx.db
        .from("class_subjects")
        .update({ teacher_id: teacher.id, updated_by: ctx.userId })
        .eq("id", classSubject.id)
        .eq("school_id", ctx.schoolId);
      if (teacherUpdateError) {
        return {
          status: "error",
          warnings: analysis.warnings,
          errors: [`Erro ao atribuir professor à disciplina da turma: ${teacherUpdateError.message}`],
          audits,
        };
      }
      classSubject.teacher_id = teacher.id;
      audits.push({
        table_name: "class_subjects",
        target_id: classSubject.id,
        action_type: "updated",
        before_data: before,
        after_data: { ...before, teacher_id: teacher.id },
      });
    } else if (teacher && classSubject.teacher_id !== teacher.id) {
      // Uma folha de horários não pode transferir uma disciplina de docente sem
      // que ninguém repare: a substituição tem o seu próprio fluxo.
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: ["A disciplina já está atribuída a outro professor nesta turma."],
        audits,
      };
    }

    const startTimeKey = timeKey(startTime);
    const slotKey = `${classSubject.id}:${weekday}:${startTimeKey}`;
    if (cache.existingSlots.has(slotKey)) {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: slotKey,
      };
    }

    const { data, error } = await ctx.db
      .from("timetable_slots")
      .insert({
        school_id: ctx.schoolId,
        class_subject_id: classSubject.id,
        weekday,
        starts_at: timeKey(startTime),
        ends_at: timeKey(endTime),
        room,
        status: "active",
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar tempo de horário: ${error.message}`],
        audits: [],
      };
    }

    cache.existingSlots.add(slotKey);
    cache.scheduledSlots.push({
      classGroupId: group.id,
      teacherId: classSubject.teacher_id,
      weekday,
      startsAt: parseTimeToMinutes(startTime)!,
      endsAt: parseTimeToMinutes(endTime)!,
      room,
    });
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        ...audits,
        {
          table_name: "timetable_slots",
          target_id: String(data.id),
          action_type: "inserted",
          after_data: {
            school_id: ctx.schoolId,
            class_subject_id: classSubject.id,
            weekday,
            starts_at: startTime,
            ends_at: endTime,
            room,
            status: "active",
          },
        },
      ],
      target_record_id: String(data.id),
    };
  },
};
