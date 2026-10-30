/**
 * Presença do professor na sala de aula: regras puras, partilhadas pelo servidor e
 * pelos ecrãs. As horas são HH:MM(:SS) do horário e o «agora» é a hora de Luanda.
 */

/** Pode confirmar a entrada a partir de 15 minutos antes do início. */
export const TEACHER_CHECKIN_EARLY_MINUTES = 15;
/** Até 5 minutos depois do início conta como «a horas». */
export const TEACHER_LATE_GRACE_MINUTES = 5;

export type TeacherCheckinMethod = "portal" | "call" | "qr" | "manual";

export type TeacherPresenceState =
  /** Confirmou a horas. */
  | "confirmed"
  /** Confirmou depois da tolerância. */
  | "late"
  /** Chamada feita antes desta funcionalidade, sem hora de entrada. */
  | "call_only"
  /** A aula já começou e ainda não confirmou. */
  | "awaiting"
  /** A aula acabou (ou o dia passou) sem confirmação. */
  | "missing"
  /** Ainda não começou. */
  | "upcoming"
  | "cancelled";

export type TeacherPresenceFields = {
  teacher_checked_in_at: string | null;
  teacher_checkin_method: TeacherCheckinMethod | null;
  teacher_late_minutes: number | null;
  teacher_checked_out_at: string | null;
  teacher_presence_note: string | null;
};

export const TEACHER_PRESENCE_COLUMNS =
  "teacher_checked_in_at, teacher_checkin_method, teacher_late_minutes, teacher_checked_out_at, teacher_presence_note";

export function minutesOfDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Janela em que o próprio professor pode confirmar a entrada: no dia da aula, de 15
 * minutos antes do início até ao fim. Uma aula sem hora aceita durante o dia todo.
 */
export function teacherCheckinWindow(input: {
  lessonDate: string;
  startsAt: string | null | undefined;
  endsAt: string | null | undefined;
  today: string;
  nowTime: string;
}): "open" | "too_early" | "closed" | "other_day" {
  if (input.lessonDate !== input.today) {
    return input.lessonDate > input.today ? "other_day" : "closed";
  }
  const now = minutesOfDay(input.nowTime);
  const start = minutesOfDay(input.startsAt);
  const end = minutesOfDay(input.endsAt);
  if (now == null || start == null) return "open";
  if (now < start - TEACHER_CHECKIN_EARLY_MINUTES) return "too_early";
  if (end != null && end > start && now >= end) return "closed";
  return "open";
}

/** Minutos depois do início (0 antes ou a horas). Sem hora de início, 0. */
export function teacherLateMinutes(startsAt: string | null | undefined, nowTime: string): number {
  const start = minutesOfDay(startsAt);
  const now = minutesOfDay(nowTime);
  if (start == null || now == null) return 0;
  return Math.max(0, Math.min(1440, now - start));
}

export function teacherPresenceState(input: {
  lessonDate: string;
  startsAt: string | null | undefined;
  endsAt: string | null | undefined;
  sessionStatus: string | null | undefined;
  checkedInAt: string | null | undefined;
  lateMinutes: number | null | undefined;
  today: string;
  nowTime: string;
}): TeacherPresenceState {
  if (input.sessionStatus === "cancelled") return "cancelled";
  if (input.checkedInAt) {
    return (input.lateMinutes ?? 0) > TEACHER_LATE_GRACE_MINUTES ? "late" : "confirmed";
  }
  if (input.sessionStatus === "completed") return "call_only";
  if (input.lessonDate < input.today) return "missing";
  if (input.lessonDate > input.today) return "upcoming";
  const now = minutesOfDay(input.nowTime);
  const start = minutesOfDay(input.startsAt);
  const end = minutesOfDay(input.endsAt);
  if (now == null || start == null) return "awaiting";
  if (now < start) return "upcoming";
  if (end != null && end > start && now >= end) return "missing";
  return "awaiting";
}

export const TEACHER_PRESENCE_LABELS: Record<TeacherPresenceState, string> = {
  confirmed: "Professor na sala",
  late: "Entrou atrasado",
  call_only: "Chamada feita",
  awaiting: "Por confirmar",
  missing: "Sem presença",
  upcoming: "Ainda não começou",
  cancelled: "Aula cancelada",
};

export const TEACHER_CHECKIN_METHOD_LABELS: Record<TeacherCheckinMethod, string> = {
  portal: "confirmada pelo professor",
  call: "pela chamada",
  qr: "por QR",
  manual: "registada pela Direcção",
};

/** Lê as colunas de presença de uma linha (nulas se a migração ainda não correu). */
export function readTeacherPresence(row: Record<string, unknown> | null | undefined): {
  enabled: boolean;
  fields: TeacherPresenceFields;
} {
  const source = row ?? {};
  const method = source.teacher_checkin_method;
  return {
    enabled: Object.prototype.hasOwnProperty.call(source, "teacher_checked_in_at"),
    fields: {
      teacher_checked_in_at: source.teacher_checked_in_at
        ? String(source.teacher_checked_in_at)
        : null,
      teacher_checkin_method:
        method === "portal" || method === "call" || method === "qr" || method === "manual"
          ? method
          : null,
      teacher_late_minutes:
        source.teacher_late_minutes == null ? null : Number(source.teacher_late_minutes),
      teacher_checked_out_at: source.teacher_checked_out_at
        ? String(source.teacher_checked_out_at)
        : null,
      teacher_presence_note: source.teacher_presence_note
        ? String(source.teacher_presence_note)
        : null,
    },
  };
}

/** Coluna inexistente (migração por aplicar): Postgres 42703 ou PostgREST PGRST204. */
export function isMissingPresenceColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /teacher_checked_in_at|teacher_checkin_method|teacher_late_minutes/.test(
    error.message ?? "",
  );
}

/** HH:MM em Luanda de um instante ISO. */
export function luandaTimeOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
