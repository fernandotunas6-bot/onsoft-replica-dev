/**
 * Textos das notificações de horário (publicação e lembrete da véspera) e
 * regras de quando enviar. Puro: sem I/O, para ser testado.
 */

export type LessonLine = {
  startsAt: string;
  endsAt: string;
  subjectName: string;
  className?: string | null;
  room?: string | null;
  deliveryMode?: string | null;
};

export type ReminderAudience = "teacher" | "student" | "guardian";

export type ReminderSettings = {
  enabled: boolean;
  sendHour: number;
  notifyTeachers: boolean;
  notifyStudents: boolean;
  notifyGuardians: boolean;
  channelInApp: boolean;
  channelEmail: boolean;
  channelSms: boolean;
  notifyOnPublish: boolean;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  sendHour: 18,
  notifyTeachers: true,
  notifyStudents: true,
  notifyGuardians: false,
  channelInApp: true,
  channelEmail: false,
  channelSms: false,
  notifyOnPublish: true,
};

export const LESSON_TYPES = [
  "teorica",
  "pratica",
  "laboratorio",
  "revisao",
  "avaliacao",
  "outra",
] as const;
export const DELIVERY_MODES = ["presencial", "zoom", "online", "hibrido"] as const;
export const TASK_KINDS = ["tpc", "trabalho", "leitura", "projecto", "pesquisa", "outra"] as const;

export const DELIVERY_MODE_LABELS: Record<string, string> = {
  presencial: "Presencial",
  zoom: "Zoom",
  online: "Online",
  hibrido: "Híbrida",
};

export const LESSON_TYPE_LABELS: Record<string, string> = {
  teorica: "Teórica",
  pratica: "Prática",
  laboratorio: "Laboratório",
  revisao: "Revisão",
  avaliacao: "Avaliação",
  outra: "Outra",
};

export const TASK_KIND_LABELS: Record<string, string> = {
  tpc: "TPC",
  trabalho: "Trabalho",
  leitura: "Leitura",
  projecto: "Projecto",
  pesquisa: "Pesquisa",
  outra: "Tarefa",
};

/** Data civil de Luanda (AAAA-MM-DD) e hora local (0–23). */
export function luandaNow(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda" }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Luanda",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  return { date, hour: hour % 24 };
}

export function addDays(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days, 12));
  return next.toISOString().slice(0, 10);
}

/** Date.getDay (0 = domingo) de uma data civil. */
export function weekdayOf(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay();
}

/** O lembrete sai uma vez por dia, na hora configurada pela escola. */
export function isReminderHour(settings: ReminderSettings, hour: number) {
  return settings.enabled && settings.sendHour === hour;
}

export function reminderChannels(settings: ReminderSettings) {
  return [
    settings.channelInApp ? ("in_app" as const) : null,
    settings.channelEmail ? ("email" as const) : null,
    settings.channelSms ? ("sms" as const) : null,
  ].filter((c): c is "in_app" | "email" | "sms" => c !== null);
}

export function formatDateLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y!, m! - 1, d!, 12)));
}

function lessonLine(lesson: LessonLine, withClass: boolean) {
  const time = `${lesson.startsAt.slice(0, 5)}–${lesson.endsAt.slice(0, 5)}`;
  const where =
    lesson.deliveryMode && lesson.deliveryMode !== "presencial"
      ? (DELIVERY_MODE_LABELS[lesson.deliveryMode] ?? lesson.deliveryMode)
      : lesson.room
        ? `Sala ${lesson.room}`
        : null;
  return [time, lesson.subjectName, withClass && lesson.className ? lesson.className : null, where]
    .filter(Boolean)
    .join(" · ");
}

/** Lembrete da véspera: título curto e corpo com uma aula por linha. */
export function buildReminderMessage(input: {
  lessons: LessonLine[];
  date: string;
  audience: ReminderAudience;
  studentName?: string | null;
}) {
  const lessons = [...input.lessons].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const count = lessons.length;
  const when = formatDateLabel(input.date);
  const who = input.audience === "guardian" && input.studentName ? ` de ${input.studentName}` : "";
  const title =
    input.audience === "teacher"
      ? `Amanhã tem ${count} ${count === 1 ? "aula" : "aulas"}`
      : `Aulas de amanhã${who}`;
  const body = [
    `${when.charAt(0).toUpperCase()}${when.slice(1)}:`,
    ...lessons.map((lesson) => `• ${lessonLine(lesson, input.audience === "teacher")}`),
  ].join("\n");
  return { title, body };
}

/** Aviso de horário publicado. */
export function buildPublishedMessage(input: {
  className: string;
  audience: ReminderAudience;
  validFrom?: string | null;
  lessonsPerWeek: number;
}) {
  const from = input.validFrom ? ` a partir de ${formatDateLabel(input.validFrom)}` : "";
  const title =
    input.audience === "teacher"
      ? `Horário da ${input.className} publicado`
      : `Novo horário da turma ${input.className}`;
  const body =
    input.audience === "teacher"
      ? `O horário da turma ${input.className} foi publicado${from}. Veja as suas aulas no portal.`
      : `O horário da turma ${input.className} foi publicado${from}: ${input.lessonsPerWeek} ${
          input.lessonsPerWeek === 1 ? "aula" : "aulas"
        } por semana. Consulte-o no portal.`;
  return { title, body };
}

/** SMS: uma linha, sem ultrapassar 2 segmentos (≈ 300 caracteres). */
export function toSmsText(title: string, body: string, limit = 300) {
  const text = `${title}. ${body.replace(/\n•\s*/g, "; ").replace(/\n/g, " ")}`.replace(
    /\s+/g,
    " ",
  );
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
