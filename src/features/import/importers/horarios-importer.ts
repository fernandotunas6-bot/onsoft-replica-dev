import { readAllPages } from "@/integrations/supabase/read-all-pages";
import { foldForCompare, normalizeText, valueOf } from "../engine/normalize";
import type { AuditEntry, ImportRefCache, RowImporter } from "../engine/types";
import {
  loadClassSubjectRefs,
  loadTeacherRefs,
  resolveSubject,
  uniqueExactMatch,
  type ClassSubjectRef,
  type TeacherRef,
} from "./academic-core";

type Ref = { id: string; code: string; name: string };
type RoomRef = { id: string; code: string; name: string };
type ShiftRef = { id: string; startsAt: number; endsAt: number };
type ScheduledSlot = {
  classGroupId: string;
  teacherId: string | null;
  weekday: number;
  startsAt: number;
  endsAt: number;
  room: string;
  roomId?: string | null;
  /** Linha deste ficheiro (pré-visualização) e não aula já gravada. */
  fromFile?: boolean;
};
type HorariosCache = ImportRefCache & {
  classGroups: Ref[];
  subjects: Ref[];
  teachers: TeacherRef[];
  classSubjects: ClassSubjectRef[];
  existingSlots: Set<string>; // key: `${class_subject_id}:${weekday}:${starts_at}`
  scheduledSlots: ScheduledSlot[];
  rooms?: RoomRef[];
  shifts?: ShiftRef[];
  /** class_subject_id → tempos semanais definidos. */
  weeklyPeriods?: Map<string, number>;
  /** class_subject_id → aulas activas já gravadas. */
  existingCounts?: Map<string, number>;
  /** `${turma}:${disciplina}` → aulas desta disciplina já vistas no ficheiro. */
  fileCounts?: Map<string, number>;
  /** `${turma}:${disciplina}:${dia}:${HH:MM}` das linhas do ficheiro já vistas. */
  fileKeys?: Set<string>;
  /** class_subject_id criados por esta importação → aulas gravadas neles. */
  createdHere?: Map<string, number>;
  /** A análise regista as linhas do ficheiro (staging); o commit faz a contabilidade ele próprio. */
  tracking?: boolean;
};

/** Rótulos que não identificam uma sala (iguais a private.timetable_room_is_explicit). */
const PLACEHOLDER_ROOMS = new Set(["", "sala", "a definir", "sem sala fixa"]);

function roomKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isExplicitRoom(value: unknown) {
  return !PLACEHOLDER_ROOMS.has(roomKey(value));
}

const WEEKDAY_WORDS: Array<[number, string[]]> = [
  [1, ["segunda", "seg", "monday", "mon"]],
  [2, ["terca", "ter", "tuesday", "tue"]],
  [3, ["quarta", "qua", "wednesday", "wed"]],
  [4, ["quinta", "qui", "thursday", "thu"]],
  [5, ["sexta", "sex", "friday", "fri"]],
  [6, ["sabado", "sab", "saturday", "sat"]],
  [7, ["domingo", "dom", "sunday", "sun"]],
];

/**
 * Dia da semana em 1 (segunda) … 7 (domingo). Aceita «Segunda-feira», «seg.», «2ª feira»
 * (2ª = segunda, à portuguesa), nomes em inglês e o número ISO (1 = segunda).
 */
export function parseWeekday(val: unknown): number | null {
  const norm = foldForCompare(val).replace(/\.$/, "");
  if (!norm) return null;
  // «2ª», «2a feira», «2.ª-feira»: o ordinal conta a partir de domingo (1.º dia).
  const ordinal = /^([2-6])\s*\.?\s*(?:ª|a|º|o)(?:[\s-]*feira)?$/.exec(norm);
  if (ordinal) return Number(ordinal[1]) - 1;
  if (/^[1-7]$/.test(norm)) return Number(norm);
  const word = norm.split(/[\s-]/)[0] ?? "";
  for (const [day, names] of WEEKDAY_WORDS) {
    if (names.some((name) => word === name || (name.length > 3 && word.startsWith(name)))) {
      return day;
    }
  }
  return null;
}

function fromNumber(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  // Fracção do dia (célula de hora do Excel): 0,3125 = 07:30.
  if (value < 1) {
    const minutes = Math.round(value * 24 * 60);
    return minutes < 24 * 60 ? minutes : null;
  }
  // Número de série com data e hora: conta só a hora.
  if (value >= 1000) return fromNumber(value % 1);
  // «7.30» escrito numa célula de número chega como 7,3: horas e minutos.
  const hours = Math.trunc(value);
  const minutes = Math.round((value - hours) * 100);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

/**
 * Minutos desde a meia-noite. Aceita «07:30», «7:30:00», «7h30», «07h», «7.30» e a hora do
 * Excel em número (0,3125 = 07:30; um número de série com data usa só a parte da hora).
 */
export function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value === "number") return fromNumber(value);
  const text = normalizeText(value).toLowerCase();
  if (/^0?[.,]\d+$/.test(text)) return fromNumber(Number(text.replace(",", ".")));
  const match = /^(\d{1,2})\s*(?::|h|\.)\s*(\d{2})?(?::\d{2})?\s*(?:h|min)?$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeKey(value: unknown): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return normalizeText(value);
  return hhmm(minutes);
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

/** Nº de agente, BI ou, por fim, o nome completo — este só se não houver outro igual. */
function resolveTeacher(value: unknown, teachers: TeacherRef[]) {
  const byId = uniqueExactMatch(value, teachers, [(t) => t.employee_number, (t) => t.national_id]);
  if (byId.row || byId.ambiguous) return byId;
  return uniqueExactMatch(value, teachers, [(t) => t.full_name]);
}

function resolveRoom(value: unknown, rooms: RoomRef[] | undefined) {
  const label = normalizeText(value) || "A definir";
  if (!isExplicitRoom(label)) return { label, roomId: null, registered: false };
  const match = uniqueExactMatch(label, rooms ?? [], [(r) => r.code, (r) => r.name]);
  return match.row
    ? { label: match.row.name, roomId: match.row.id, registered: true }
    : { label, roomId: null, registered: false };
}

function shiftFor(startsAt: number, shifts: ShiftRef[] | undefined) {
  return shifts?.find((shift) => startsAt >= shift.startsAt && startsAt < shift.endsAt)?.id ?? null;
}

type Resolved = {
  group: Ref;
  subject: Ref;
  teacher: TeacherRef | null;
  classSubject: ClassSubjectRef | null;
  room: { label: string; roomId: string | null; registered: boolean };
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type Analysis = {
  status: "valid" | "warning" | "error" | "duplicate";
  warnings: string[];
  errors: string[];
  duplicate_of?: string | null;
  resolved?: Resolved;
};

function analyze(normalized: Record<string, unknown>, cache: HorariosCache): Analysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const groupVal = valueOf(normalized, "class_group", "turma", "codigo_turma");
  const subjectVal = valueOf(normalized, "subject", "disciplina", "materia");
  const teacherVal = valueOf(normalized, "teacher_identifier", "professor", "docente", "agente");
  const weekdayValue = parseWeekday(valueOf(normalized, "weekday", "dia", "dia_semana"));
  const startRaw = valueOf(normalized, "start_time", "inicio", "hora_inicio");
  const endRaw = valueOf(normalized, "end_time", "fim", "hora_fim");
  const startValue = startRaw === null ? null : parseTimeToMinutes(startRaw);
  const endValue = endRaw === null ? null : parseTimeToMinutes(endRaw);

  if (!groupVal) errors.push("Turma é obrigatória.");
  if (!subjectVal) errors.push("Disciplina é obrigatória.");
  if (!weekdayValue) errors.push("Dia da semana inválido (ex: Segunda-feira, Terça-feira...).");
  if (startRaw === null) errors.push("Hora de início é obrigatória (ex: 07:30).");
  if (endRaw === null) errors.push("Hora de fim é obrigatória (ex: 08:15).");
  if (startRaw !== null && startValue === null) errors.push("Hora de início inválida (use HH:MM).");
  if (endRaw !== null && endValue === null) errors.push("Hora de fim inválida (use HH:MM).");
  if (startValue !== null && endValue !== null && endValue <= startValue) {
    errors.push("A hora de fim deve ser posterior à hora de início.");
  }
  if (errors.length) return { status: "error", warnings, errors };

  const groupMatch = uniqueExactMatch(groupVal, cache.classGroups ?? [], [
    (r) => r.code,
    (r) => r.name,
  ]);
  if (groupMatch.ambiguous) errors.push(`Turma "${normalizeText(groupVal)}" é ambígua.`);
  else if (!groupMatch.row)
    errors.push(`Turma "${normalizeText(groupVal)}" não encontrada nesta escola.`);

  const subjMatch = resolveSubject(subjectVal, cache.subjects ?? []);
  if (subjMatch.ambiguous) errors.push(`Disciplina "${normalizeText(subjectVal)}" é ambígua.`);
  else if (!subjMatch.row)
    errors.push(`Disciplina "${normalizeText(subjectVal)}" não encontrada nesta escola.`);
  else if (subjMatch.viaCatalog)
    warnings.push(
      `Disciplina "${normalizeText(subjectVal)}" associada a «${subjMatch.row.name}» (${subjMatch.row.code}) pelo catálogo.`,
    );

  let teacher: TeacherRef | null = null;
  if (teacherVal) {
    const teacherMatch = resolveTeacher(teacherVal, cache.teachers ?? []);
    if (teacherMatch.ambiguous) {
      errors.push(`Professor "${normalizeText(teacherVal)}" é ambíguo; use o nº de agente.`);
    } else if (!teacherMatch.row) {
      errors.push(`Professor "${normalizeText(teacherVal)}" não encontrado nesta escola.`);
    } else {
      teacher = teacherMatch.row;
    }
  }
  if (errors.length) return { status: "error", warnings, errors };

  const group = groupMatch.row!;
  const subject = subjMatch.row!;
  const weekday = weekdayValue!;
  const startMinutes = startValue!;
  const endMinutes = endValue!;
  const pair = classSubjectKey(group.id, subject.id);
  const slotKey = `${pair}:${weekday}:${hhmm(startMinutes)}`;
  const classSubject = resolveClassSubject(group.id, subject.id, cache.classSubjects ?? []);
  if (teacher && classSubject?.teacher_id && classSubject.teacher_id !== teacher.id) {
    errors.push("A disciplina já está atribuída a outro professor nesta turma.");
    return { status: "error", warnings, errors };
  }

  if (
    classSubject &&
    cache.existingSlots?.has(`${classSubject.id}:${weekday}:${hhmm(startMinutes)}`)
  ) {
    return {
      status: "duplicate",
      warnings: ["Já existe uma aula agendada para esta turma neste dia e horário."],
      errors: [],
      duplicate_of: slotKey,
    };
  }
  if (cache.fileKeys?.has(slotKey)) {
    return {
      status: "duplicate",
      warnings: ["Esta aula repete outra linha do ficheiro (mesma turma, disciplina, dia e hora)."],
      errors: [],
      duplicate_of: slotKey,
    };
  }

  const room = resolveRoom(valueOf(normalized, "room", "sala"), cache.rooms);
  if (isExplicitRoom(room.label) && !room.registered && (cache.rooms?.length ?? 0) > 0) {
    warnings.push(`Sala «${room.label}» não está no cadastro de salas; fica só como texto.`);
  }
  const teacherId = teacher?.id ?? classSubject?.teacher_id ?? null;
  const conflict = (cache.scheduledSlots ?? []).find(
    (slot) =>
      slot.weekday === weekday &&
      intervalsOverlap(startMinutes, endMinutes, slot.startsAt, slot.endsAt) &&
      (slot.classGroupId === group.id ||
        (teacherId !== null && slot.teacherId === teacherId) ||
        (room.roomId !== null && slot.roomId === room.roomId) ||
        (isExplicitRoom(room.label) && roomKey(slot.room) === roomKey(room.label))),
  );
  if (conflict) {
    const what =
      conflict.classGroupId === group.id
        ? "a turma já tem aula"
        : teacherId !== null && conflict.teacherId === teacherId
          ? "o professor já tem aula"
          : "a sala já está ocupada";
    errors.push(
      `Conflito de horário: ${what} neste intervalo${conflict.fromFile ? " noutra linha do ficheiro" : ""}.`,
    );
    return { status: "error", warnings, errors };
  }

  // Carga semanal: a publicação exige tantas aulas quantos os tempos definidos.
  if (classSubject) {
    const weekly = cache.weeklyPeriods?.get(classSubject.id);
    const planned =
      (cache.existingCounts?.get(classSubject.id) ?? 0) + (cache.fileCounts?.get(pair) ?? 0) + 1;
    if (weekly && planned > weekly) {
      warnings.push(
        `${subject.name} passa a ter ${planned} aulas por semana nesta turma, mas a carga definida é ${weekly}; ajuste a carga antes de publicar.`,
      );
    }
  }

  return {
    status: warnings.length ? "warning" : "valid",
    warnings,
    errors: [],
    resolved: { group, subject, teacher, classSubject, room, weekday, startMinutes, endMinutes },
  };
}

/** Regista a linha como planeada: as seguintes vêem o conflito e a repetição. */
function recordPlanned(cache: HorariosCache, resolved: Resolved) {
  cache.fileKeys ??= new Set();
  cache.fileCounts ??= new Map();
  cache.scheduledSlots ??= [];
  const pair = classSubjectKey(resolved.group.id, resolved.subject.id);
  cache.fileKeys.add(`${pair}:${resolved.weekday}:${hhmm(resolved.startMinutes)}`);
  cache.fileCounts.set(pair, (cache.fileCounts.get(pair) ?? 0) + 1);
  cache.scheduledSlots.push({
    classGroupId: resolved.group.id,
    teacherId: resolved.teacher?.id ?? resolved.classSubject?.teacher_id ?? null,
    weekday: resolved.weekday,
    startsAt: resolved.startMinutes,
    endsAt: resolved.endMinutes,
    room: resolved.room.label,
    roomId: resolved.room.roomId,
    fromFile: true,
  });
}

export const horariosImporter: RowImporter = {
  module: "horarios",

  async loadRefCache(ctx) {
    // Turmas do ano lectivo da importação: o mesmo código repete-se de ano para ano.
    let groupsQuery = ctx.db
      .from("class_groups")
      .select("id, code, name, status")
      .eq("school_id", ctx.schoolId);
    if (ctx.academicYearId) groupsQuery = groupsQuery.eq("academic_year_id", ctx.academicYearId);
    const [groups, subjects, teachers, classSubjects, slotRows, rooms, shifts, loads] =
      await Promise.all([
        groupsQuery,
        ctx.db.from("subjects").select("id, code, name").eq("school_id", ctx.schoolId),
        loadTeacherRefs(ctx.db, ctx.schoolId),
        loadClassSubjectRefs(ctx.db, ctx.schoolId),
        // Só as aulas activas contam: uma cancelada ou arquivada não ocupa o tempo.
        readAllPages((from, to) =>
          ctx.db
            .from("timetable_slots")
            .select("id, class_subject_id, weekday, starts_at, ends_at, room, room_id")
            .eq("school_id", ctx.schoolId)
            .eq("status", "active")
            .order("id", { ascending: true })
            .range(from, to),
        ),
        ctx.db
          .from("rooms")
          .select("id, code, name")
          .eq("school_id", ctx.schoolId)
          .eq("status", "active"),
        ctx.db
          .from("school_shifts")
          .select("id, starts_at, ends_at")
          .eq("school_id", ctx.schoolId)
          .eq("status", "active"),
        readAllPages((from, to) =>
          ctx.db
            .from("class_subjects")
            .select("id, weekly_periods")
            .eq("school_id", ctx.schoolId)
            .eq("status", "active")
            .order("id", { ascending: true })
            .range(from, to),
        ),
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
    const existingCounts = new Map<string, number>();
    for (const r of slotRows.data ?? []) {
      const id = String(r.class_subject_id);
      existingCounts.set(id, (existingCounts.get(id) ?? 0) + 1);
    }
    const classSubjectById = new Map(classSubjects.map((row) => [row.id, row]));
    const scheduledSlots: ScheduledSlot[] = (slotRows.data ?? []).flatMap((row) => {
      const classSubject = classSubjectById.get(String(row.class_subject_id));
      const startsAt = parseTimeToMinutes(String(row.starts_at ?? ""));
      const endsAt = parseTimeToMinutes(String(row.ends_at ?? ""));
      if (!classSubject || startsAt === null || endsAt === null || endsAt <= startsAt) return [];
      return [
        {
          classGroupId: classSubject.class_group_id,
          teacherId: classSubject.teacher_id,
          weekday: Number(row.weekday),
          startsAt,
          endsAt,
          room: normalizeText(row.room) || "A definir",
          roomId: row.room_id ? String(row.room_id) : null,
        },
      ];
    });

    const cache: HorariosCache = {
      existingPeople: [],
      // Turmas encerradas ou arquivadas não recebem horário novo.
      classGroups: (groups.data ?? [])
        .filter((r) => !["closed", "archived"].includes(String(r.status ?? "")))
        .map((r) => ({
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
      rooms: rooms.error
        ? []
        : (rooms.data ?? []).map((r) => ({
            id: String(r.id),
            code: String(r.code ?? ""),
            name: String(r.name ?? ""),
          })),
      shifts: shifts.error
        ? []
        : (shifts.data ?? []).flatMap((r) => {
            const startsAt = parseTimeToMinutes(String(r.starts_at ?? ""));
            const endsAt = parseTimeToMinutes(String(r.ends_at ?? ""));
            return startsAt === null || endsAt === null || endsAt <= startsAt
              ? []
              : [{ id: String(r.id), startsAt, endsAt }];
          }),
      weeklyPeriods: new Map(
        (loads.error ? [] : (loads.data ?? [])).flatMap((r): Array<[string, number]> => {
          const periods = Number(r.weekly_periods);
          return Number.isFinite(periods) && periods > 0 ? [[String(r.id), periods]] : [];
        }),
      ),
      existingCounts,
      tracking: true,
    };
    return cache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as HorariosCache;
    const { resolved, ...result } = analyze(normalized, cache);
    // Staging: as linhas seguintes do mesmo ficheiro vêem esta (conflito, repetição, carga).
    if (resolved && cache.tracking !== false) recordPlanned(cache, resolved);
    return result;
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as HorariosCache;
    cache.tracking = false;
    const { resolved, ...analysis } = analyze(normalized, cache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }
    if (analysis.status === "duplicate" || !resolved) {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: analysis.duplicate_of ?? null,
      };
    }

    if (ctx.dryRun) {
      // A simulação também conta esta aula para as linhas seguintes, sem gravar nada.
      recordPlanned(cache, resolved);
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: null,
      };
    }

    const { group, subject: subj, teacher, room, weekday, startMinutes, endMinutes } = resolved;
    let classSubject = resolved.classSubject;
    const audits: AuditEntry[] = [];
    cache.createdHere ??= new Map();
    if (!classSubject) {
      // Turma ainda não tem esta disciplina: cria a associação com 1 tempo semanal, que
      // sobe a cada aula importada — assim a carga fica igual ao horário e a publicação
      // não é recusada por «carga semanal não corresponde».
      const { data, error } = await ctx.db
        .from("class_subjects")
        .insert({
          school_id: ctx.schoolId,
          class_group_id: group.id,
          subject_id: subj.id,
          teacher_id: teacher?.id ?? null,
          weekly_periods: 1,
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
      cache.createdHere.set(classSubject.id, 0);
      audits.push({
        table_name: "class_subjects",
        target_id: classSubject.id,
        action_type: "inserted",
        after_data: {
          school_id: ctx.schoolId,
          class_group_id: classSubject.class_group_id,
          subject_id: classSubject.subject_id,
          teacher_id: classSubject.teacher_id,
          weekly_periods: 1,
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
          errors: [
            `Erro ao atribuir professor à disciplina da turma: ${teacherUpdateError.message}`,
          ],
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
    }

    const startKey = hhmm(startMinutes);
    const endKey = hhmm(endMinutes);
    const shiftId = shiftFor(startMinutes, cache.shifts);
    const { data, error } = await ctx.db
      .from("timetable_slots")
      .insert({
        school_id: ctx.schoolId,
        class_subject_id: classSubject.id,
        weekday,
        starts_at: startKey,
        ends_at: endKey,
        room: room.label,
        room_id: room.roomId,
        shift_id: shiftId,
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
        audits,
      };
    }

    cache.existingSlots.add(`${classSubject.id}:${weekday}:${startKey}`);
    cache.existingCounts?.set(
      classSubject.id,
      (cache.existingCounts.get(classSubject.id) ?? 0) + 1,
    );
    cache.scheduledSlots.push({
      classGroupId: group.id,
      teacherId: classSubject.teacher_id,
      weekday,
      startsAt: startMinutes,
      endsAt: endMinutes,
      room: room.label,
      roomId: room.roomId,
    });

    const created = cache.createdHere.get(classSubject.id);
    if (created !== undefined) {
      const lessons = created + 1;
      cache.createdHere.set(classSubject.id, lessons);
      if (lessons > 1) {
        const periods = Math.min(lessons, 30);
        const { error: loadError } = await ctx.db
          .from("class_subjects")
          .update({ weekly_periods: periods, updated_by: ctx.userId })
          .eq("id", classSubject.id)
          .eq("school_id", ctx.schoolId);
        if (!loadError) {
          audits.push({
            table_name: "class_subjects",
            target_id: classSubject.id,
            action_type: "updated",
            before_data: { weekly_periods: lessons - 1 },
            after_data: { weekly_periods: periods },
          });
        }
      }
    }

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
            starts_at: startKey,
            ends_at: endKey,
            room: room.label,
            room_id: room.roomId,
            shift_id: shiftId,
            status: "active",
          },
        },
      ],
      target_record_id: String(data.id),
    };
  },
};
