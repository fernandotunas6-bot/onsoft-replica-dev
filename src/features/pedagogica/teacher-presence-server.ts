import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { resolveUserLinkedEntities } from "@/features/auth/server";
import { schoolTodayIso } from "@/lib/school-date";
import { nowTimeInLuanda } from "@/features/dashboard/school-today";
import {
  isMissingPresenceColumn,
  readTeacherPresence,
  teacherCheckinWindow,
  teacherLateMinutes,
  type TeacherCheckinMethod,
  type TeacherPresenceFields,
} from "@/features/pedagogica/teacher-presence";
import {
  PRESENCE_MODE_OFF_MESSAGE,
  PRESENCE_MODE_QR_MESSAGE,
  loadSchoolPresenceMode,
} from "@/features/pedagogica/school-presence-mode";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export const PRESENCE_SQL_MISSING_MESSAGE =
  "A presença do professor ainda não está activa nesta escola: falta aplicar o SQL docs/agents/SIGA_aplicar_presenca_professor.sql no Supabase.";

export const confirmTeacherLessonPresenceInputSchema = z.object({
  sessionId: z.string().guid(),
  action: z.enum(["check_in", "check_out"]).default("check_in"),
  /** Obrigatória quando é a Direcção/Secretaria a registar pelo professor. */
  note: z.string().trim().max(500).optional(),
});

/**
 * Grava a entrada do professor numa aula, só se ainda não houver uma (a condição
 * `is null` no próprio update evita que dois pedidos simultâneos se sobreponham).
 * Devolve `false` quando a aula já tinha entrada e `null` quando as colunas ainda
 * não existem (migração por aplicar).
 */
export async function recordTeacherCheckin(
  db: AdminDb,
  input: {
    schoolId: string;
    sessionId: string;
    userId: string;
    method: TeacherCheckinMethod;
    startsAt: string | null;
    now?: Date;
    note?: string | null;
  },
): Promise<boolean | null> {
  const now = input.now ?? new Date();
  const late = teacherLateMinutes(input.startsAt, nowTimeInLuanda(now));
  const { data, error } = await db
    .from("siga_attendance_sessions")
    .update({
      teacher_checked_in_at: now.toISOString(),
      teacher_checked_in_by: input.userId,
      teacher_checkin_method: input.method,
      teacher_late_minutes: late,
      teacher_presence_note: input.note ?? null,
      updated_at: now.toISOString(),
      updated_by: input.userId,
    })
    .eq("id", input.sessionId)
    .eq("school_id", input.schoolId)
    .is("teacher_checked_in_at", null)
    .select("id");
  if (error) {
    if (isMissingPresenceColumn(error)) return null;
    throw publicDatabaseError(error, "Não foi possível registar a presença do professor.");
  }
  return (data ?? []).length > 0;
}

export type TeacherPresenceResult = {
  sessionId: string;
  alreadyRecorded: boolean;
  presence: TeacherPresenceFields;
};

export const confirmTeacherLessonPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => confirmTeacherLessonPresenceInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<TeacherPresenceResult> => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;

    const { data: row, error } = await db
      .from("siga_attendance_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível abrir esta aula.");
    if (!row) throw new Error("Aula não encontrada.");

    const session = row as Record<string, unknown>;
    const { enabled, fields } = readTeacherPresence(session);
    if (!enabled) throw new Error(PRESENCE_SQL_MISSING_MESSAGE);
    if (session.status === "cancelled") {
      throw new Error("Esta aula foi cancelada: não há presença a registar.");
    }

    const isTeacher = membership.appRole === "Professor";
    const lessonDate = String(session.lesson_date ?? "");
    const startsAt = session.starts_at ? String(session.starts_at) : null;
    const endsAt = session.ends_at ? String(session.ends_at) : null;
    const now = new Date();
    const today = schoolTodayIso(now);
    const nowTime = nowTimeInLuanda(now);
    const note = data.note?.trim() || null;

    // Modo da escola: com o QR obrigatório, o professor só entra lendo o QR (a
    // Direcção continua a poder registar com motivo); desligado, ninguém regista.
    const mode = await loadSchoolPresenceMode(db, schoolId);
    if (mode === "off") throw new Error(PRESENCE_MODE_OFF_MESSAGE);
    if (mode === "qr" && isTeacher && data.action === "check_in") {
      throw new Error(PRESENCE_MODE_QR_MESSAGE);
    }

    if (isTeacher) {
      const linked = await resolveUserLinkedEntities(db, schoolId, context.userId);
      const sessionTeacher = session.teacher_id ? String(session.teacher_id) : null;
      if (!linked.teacher_id || !sessionTeacher || linked.teacher_id !== sessionTeacher) {
        throw new Error("Só o professor desta aula pode confirmar a presença.");
      }
    } else {
      // A Direcção regista pelo professor (telemóvel sem bateria, sem rede…): com nota,
      // nunca para uma aula que ainda não chegou.
      if (!note || note.length < 5) {
        throw new Error("Indique o motivo do registo (pelo menos 5 caracteres).");
      }
      if (lessonDate > today) {
        throw new Error("Não se regista presença numa aula que ainda não aconteceu.");
      }
    }

    if (data.action === "check_in") {
      if (fields.teacher_checked_in_at) {
        return { sessionId: data.sessionId, alreadyRecorded: true, presence: fields };
      }
      if (isTeacher) {
        const window = teacherCheckinWindow({ lessonDate, startsAt, endsAt, today, nowTime });
        if (window === "too_early") {
          throw new Error(
            `Ainda é cedo: pode confirmar a partir de 15 minutos antes do início (${String(startsAt).slice(0, 5)}).`,
          );
        }
        if (window === "other_day") {
          throw new Error("Esta aula é noutro dia: confirme a presença no dia da aula.");
        }
        if (window === "closed") {
          throw new Error(
            "A aula já terminou. Peça à Direcção ou à Secretaria para registar a sua presença, com o motivo.",
          );
        }
      }
      const recorded = await recordTeacherCheckin(db, {
        schoolId,
        sessionId: data.sessionId,
        userId: context.userId,
        method: isTeacher ? "portal" : "manual",
        // Registo da Direcção depois da aula: a hora do registo não é a da entrada,
        // por isso o atraso não se calcula (fica 0) e a nota explica.
        startsAt: isTeacher ? startsAt : null,
        now,
        note: isTeacher ? null : note,
      });
      if (recorded === null) throw new Error(PRESENCE_SQL_MISSING_MESSAGE);
      const { data: fresh } = await db
        .from("siga_attendance_sessions")
        .select("*")
        .eq("id", data.sessionId)
        .eq("school_id", schoolId)
        .maybeSingle();
      return {
        sessionId: data.sessionId,
        alreadyRecorded: !recorded,
        presence: readTeacherPresence(fresh as Record<string, unknown> | null).fields,
      };
    }

    // Saída: opcional, só depois da entrada e uma vez.
    if (!fields.teacher_checked_in_at) {
      throw new Error("Confirme primeiro a entrada nesta aula.");
    }
    if (fields.teacher_checked_out_at) {
      return { sessionId: data.sessionId, alreadyRecorded: true, presence: fields };
    }
    if (isTeacher && lessonDate !== today) {
      throw new Error("A saída regista-se no dia da aula.");
    }
    const { data: updated, error: outError } = await db
      .from("siga_attendance_sessions")
      .update({
        teacher_checked_out_at: now.toISOString(),
        updated_at: now.toISOString(),
        updated_by: context.userId,
      })
      .eq("id", data.sessionId)
      .eq("school_id", schoolId)
      .is("teacher_checked_out_at", null)
      .select("*")
      .maybeSingle();
    if (outError) {
      if (isMissingPresenceColumn(outError)) throw new Error(PRESENCE_SQL_MISSING_MESSAGE);
      throw publicDatabaseError(outError, "Não foi possível registar a saída do professor.");
    }
    return {
      sessionId: data.sessionId,
      alreadyRecorded: !updated,
      presence: readTeacherPresence((updated ?? session) as Record<string, unknown>).fields,
    };
  });
