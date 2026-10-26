import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { resolveUserLinkedEntities } from "@/features/auth/server";
import { schoolTodayIso } from "@/lib/school-date";
import {
  PRESENCE_SCAN_REASON_LABELS,
  addDays,
  decidePresenceScan,
  formatSchoolQr,
  luandaDateOf,
  luandaTimeOfMs,
  mondayOf,
  mondayOfPrintedStep,
  parseSchoolQr,
  printedStepOf,
  safeEqual,
  schoolQrDayKey,
  schoolQrMac,
  schoolQrWeekKey,
  type PresenceDecision,
  type PresenceScanReason,
  type SchoolPresenceMode,
} from "@/features/pedagogica/school-qr";
import {
  TEACHER_CHECKIN_EARLY_MINUTES,
  minutesOfDay,
  readTeacherPresence,
  type TeacherPresenceFields,
} from "@/features/pedagogica/teacher-presence";
import { recordTeacherCheckin } from "@/features/pedagogica/teacher-presence-server";
import { loadSchoolPresenceMode } from "@/features/pedagogica/school-presence-mode";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export const SCHOOL_QR_SQL_MISSING_MESSAGE =
  "O QR da escola ainda não está activo: falta aplicar o SQL docs/agents/SIGA_aplicar_qr_escola.sql no Supabase.";

// ── Definições ────────────────────────────────────────────────────────────────

type SettingsRow = {
  school_id: string;
  mode: SchoolPresenceMode;
  qr_secret: string;
  qr_secret_version: number;
  rotation_seconds: number;
  allow_printed: boolean;
  require_location: boolean;
  center_latitude: number | null;
  center_longitude: number | null;
  geofence_radius_m: number;
  offline_max_hours: number;
  updated_at: string | null;
};

export type SchoolPresenceConfig = {
  available: boolean;
  mode: SchoolPresenceMode;
  rotationSeconds: number;
  allowPrinted: boolean;
  requireLocation: boolean;
  center: { latitude: number; longitude: number } | null;
  radiusM: number;
  offlineMaxHours: number;
  updatedAt: string | null;
};

const DEFAULT_CONFIG: Omit<SchoolPresenceConfig, "available"> = {
  mode: "button",
  rotationSeconds: 30,
  allowPrinted: true,
  requireLocation: true,
  center: null,
  radiusM: 250,
  offlineMaxHours: 72,
  updatedAt: null,
};

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /siga_school_presence_settings|siga_teacher_presence_scans/.test(error.message ?? "")
  );
}

function toConfig(row: SettingsRow | null, available: boolean): SchoolPresenceConfig {
  if (!row) return { available, ...DEFAULT_CONFIG };
  return {
    available,
    mode: row.mode,
    rotationSeconds: Number(row.rotation_seconds),
    allowPrinted: Boolean(row.allow_printed),
    requireLocation: Boolean(row.require_location),
    center:
      row.center_latitude != null && row.center_longitude != null
        ? { latitude: Number(row.center_latitude), longitude: Number(row.center_longitude) }
        : null,
    radiusM: Number(row.geofence_radius_m),
    offlineMaxHours: Number(row.offline_max_hours),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

/** `null` quando a tabela ainda não existe (SQL por aplicar). */
export async function loadSchoolPresenceSettings(
  db: AdminDb,
  schoolId: string,
): Promise<{ available: boolean; row: SettingsRow | null }> {
  const { data, error } = await db
    .from("siga_school_presence_settings")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { available: false, row: null };
    throw publicDatabaseError(error, "Não foi possível ler as definições de presença.");
  }
  return { available: true, row: (data as SettingsRow | null) ?? null };
}

async function ensureSettings(db: AdminDb, schoolId: string, userId: string) {
  const loaded = await loadSchoolPresenceSettings(db, schoolId);
  if (!loaded.available) throw new Error(SCHOOL_QR_SQL_MISSING_MESSAGE);
  if (loaded.row) return loaded.row;
  const { data, error } = await db
    .from("siga_school_presence_settings")
    .insert({
      school_id: schoolId,
      qr_secret: randomBytes(32).toString("base64url"),
      updated_by: userId,
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const again = await loadSchoolPresenceSettings(db, schoolId);
    if (again.row) return again.row;
  }
  if (error) throw publicDatabaseError(error, "Não foi possível preparar o QR da escola.");
  if (!data) throw new Error("Não foi possível preparar o QR da escola.");
  return data as SettingsRow;
}

const STAFF_ROLES = ["Administrador", "Secretaria"] as const;

export const getSchoolPresenceConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.userId, [...STAFF_ROLES]);
    const db = await loadSgaAdminClient();
    const { available, row } = await loadSchoolPresenceSettings(db, membership.schoolId);
    return {
      ...toConfig(row, available),
      canEdit: membership.appRole === "Administrador",
    };
  });

export const updateSchoolPresenceConfigInputSchema = z.object({
  mode: z.enum(["off", "button", "qr"]),
  rotationSeconds: z.number().int().min(15).max(300).default(30),
  allowPrinted: z.boolean().default(true),
  requireLocation: z.boolean().default(true),
  center: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .nullable()
    .default(null),
  radiusM: z.number().int().min(50).max(5000).default(250),
  offlineMaxHours: z.number().int().min(1).max(168).default(72),
  /** Anula todos os QR já mostrados ou impressos (fotografia que circulou, por exemplo). */
  rotateSecret: z.boolean().default(false),
});

export const updateSchoolPresenceConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchoolPresenceConfigInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Desligar ou mudar as regras é decisão da Direcção.
    const membership = await requireSgaWriterForWrite("pedagogica", context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const current = await ensureSettings(db, membership.schoolId, context.userId);
    const { data: updated, error } = await db
      .from("siga_school_presence_settings")
      .update({
        mode: data.mode,
        rotation_seconds: data.rotationSeconds,
        allow_printed: data.allowPrinted,
        require_location: data.requireLocation,
        center_latitude: data.center?.latitude ?? null,
        center_longitude: data.center?.longitude ?? null,
        geofence_radius_m: data.radiusM,
        offline_max_hours: data.offlineMaxHours,
        ...(data.rotateSecret
          ? {
              qr_secret: randomBytes(32).toString("base64url"),
              qr_secret_version: Number(current.qr_secret_version) + 1,
            }
          : {}),
        updated_by: context.userId,
      })
      .eq("school_id", membership.schoolId)
      .select("*")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível guardar as definições.");
    return { ...toConfig(updated as SettingsRow, true), canEdit: true };
  });

/**
 * Chaves do dia para o ecrã da Direcção gerar o QR rotativo sem rede (hoje e
 * amanhã). A chave de um dia só assina QR desse dia: se o tablet se perder, o
 * estrago acaba no dia seguinte, e «Anular QR» corta-o já.
 */
export const getSchoolQrDisplayKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.userId, [...STAFF_ROLES]);
    const db = await loadSgaAdminClient();
    const settings = await ensureSettings(db, membership.schoolId, context.userId);
    const today = schoolTodayIso();
    const dates = [today, addDays(today, 1)];
    const keys = await Promise.all(
      dates.map(async (date) => ({
        date,
        key: await schoolQrDayKey(settings.qr_secret, date, Number(settings.qr_secret_version)),
      })),
    );
    return {
      schoolId: membership.schoolId,
      mode: settings.mode,
      rotationSeconds: Number(settings.rotation_seconds),
      serverNowMs: Date.now(),
      keys,
    };
  });

/** QR impresso da semana (desta ou da próxima). Exige a zona da escola para valer. */
export const getPrintableSchoolQr = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ week: z.enum(["current", "next"]).default("current") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.userId, [...STAFF_ROLES]);
    const db = await loadSgaAdminClient();
    const settings = await ensureSettings(db, membership.schoolId, context.userId);
    if (!settings.allow_printed) {
      throw new Error("O QR impresso está desligado nas definições da escola.");
    }
    const thisMonday = mondayOf(schoolTodayIso());
    const monday = data.week === "next" ? addDays(thisMonday, 7) : thisMonday;
    const step = printedStepOf(monday);
    const key = await schoolQrWeekKey(
      settings.qr_secret,
      monday,
      Number(settings.qr_secret_version),
    );
    const mac = await schoolQrMac(key, { schoolId: membership.schoolId, kind: "printed", step });
    return {
      token: formatSchoolQr({ schoolId: membership.schoolId, kind: "printed", step }, mac),
      monday,
      sunday: addDays(monday, 6),
      zoneConfigured: settings.center_latitude != null,
    };
  });

// ── Aulas do professor num dia ────────────────────────────────────────────────

export type TeacherDayLesson = {
  sessionId: string;
  classGroupId: string;
  classGroupName: string;
  subjectId: string;
  subjectName: string;
  room: string | null;
  lessonDate: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  presence: TeacherPresenceFields;
};

/**
 * As aulas do horário de um professor num dia, criando as sessões que faltam
 * (como `listTeacherAttendanceSessions`, mas só para este professor).
 */
export async function ensureTeacherDaySessions(
  db: AdminDb,
  input: { schoolId: string; teacherId: string; date: string; userId: string },
): Promise<TeacherDayLesson[]> {
  const { data: classSubjects, error: csError } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .eq("school_id", input.schoolId)
    .eq("teacher_id", input.teacherId)
    .eq("status", "active");
  if (csError) throw publicDatabaseError(csError, "Não foi possível ler as suas aulas.");
  const csRows = (classSubjects ?? []) as Array<{
    id: string;
    class_group_id: string;
    subject_id: string;
    teacher_id: string;
  }>;
  if (csRows.length === 0) return [];
  const csMap = new Map(csRows.map((row) => [row.id, row]));
  const weekday = new Date(`${input.date}T12:00:00Z`).getUTCDay();
  const { data: slots } = await db
    .from("timetable_slots")
    .select("id, class_subject_id, starts_at, ends_at, room")
    .in(
      "class_subject_id",
      csRows.map((row) => row.id),
    )
    .eq("weekday", weekday)
    .eq("status", "active")
    .order("starts_at");
  const slotRows = (slots ?? []) as Array<{
    id: string;
    class_subject_id: string;
    starts_at: string;
    ends_at: string;
    room: string | null;
  }>;
  if (slotRows.length === 0) return [];

  const readSessions = async () => {
    const { data } = await db
      .from("siga_attendance_sessions")
      .select("*")
      .eq("school_id", input.schoolId)
      .eq("lesson_date", input.date)
      .in(
        "timetable_slot_id",
        slotRows.map((slot) => slot.id),
      );
    return new Map(
      ((data ?? []) as Array<Record<string, unknown>>).map((row) => [
        String(row.timetable_slot_id),
        row,
      ]),
    );
  };
  let bySlot = await readSessions();
  const missing = slotRows.filter((slot) => !bySlot.has(slot.id));
  if (missing.length) {
    const { error } = await db.from("siga_attendance_sessions").insert(
      missing.map((slot) => {
        const cs = csMap.get(slot.class_subject_id)!;
        return {
          school_id: input.schoolId,
          class_group_id: cs.class_group_id,
          subject_id: cs.subject_id,
          teacher_id: cs.teacher_id,
          timetable_slot_id: slot.id,
          lesson_date: input.date,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          status: "pending",
          created_by: input.userId,
        };
      }),
    );
    if (error && error.code !== "23505") {
      throw publicDatabaseError(error, "Não foi possível preparar as aulas do dia.");
    }
    bySlot = await readSessions();
  }

  const groupIds = [...new Set(csRows.map((row) => row.class_group_id))];
  const subjectIds = [...new Set(csRows.map((row) => row.subject_id))];
  const [{ data: groups }, { data: subjects }] = await Promise.all([
    db.from("class_groups").select("id, name").in("id", groupIds),
    db.from("subjects").select("id, name").in("id", subjectIds),
  ]);
  const groupName = new Map(
    ((groups ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );
  const subjectName = new Map(
    ((subjects ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );

  const lessons: TeacherDayLesson[] = [];
  for (const slot of slotRows) {
    const session = bySlot.get(slot.id);
    const cs = csMap.get(slot.class_subject_id);
    if (!session || !cs) continue;
    lessons.push({
      sessionId: String(session.id),
      classGroupId: cs.class_group_id,
      classGroupName: groupName.get(cs.class_group_id) ?? "Turma",
      subjectId: cs.subject_id,
      subjectName: subjectName.get(cs.subject_id) ?? "Disciplina",
      room: slot.room ?? null,
      lessonDate: input.date,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      status: String(session.status ?? "pending"),
      presence: readTeacherPresence(session).fields,
    });
  }
  return lessons;
}

/** Aulas abertas a esta hora: de 15 min antes do início até ao fim. */
export function lessonsOpenAt(lessons: TeacherDayLesson[], time: string) {
  const now = minutesOfDay(time);
  if (now == null) return [];
  return lessons.filter((lesson) => {
    if (lesson.status === "cancelled") return false;
    const start = minutesOfDay(lesson.startsAt);
    const end = minutesOfDay(lesson.endsAt);
    if (start == null) return true;
    if (now < start - TEACHER_CHECKIN_EARLY_MINUTES) return false;
    return end == null || end <= start || now < end;
  });
}

// ── Leitura do QR ─────────────────────────────────────────────────────────────

export const presenceScanInputSchema = z.object({
  token: z.string().trim().min(20).max(300),
  /** Leitura guardada sem rede no telemóvel e enviada agora. */
  offline: z.boolean().default(false),
  deviceScannedAt: z.string().datetime({ offset: true }).optional(),
  deviceNow: z.string().datetime({ offset: true }).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  mocked: z.boolean().nullable().optional(),
  deviceId: z.string().trim().max(128).optional(),
  /** Id do envio (UUID): repetir o mesmo devolve a mesma leitura. */
  opId: z.string().uuid().optional(),
});

export type PresenceScanResult = {
  scanId: string | null;
  decision: PresenceDecision;
  reasons: PresenceScanReason[];
  reasonLabels: string[];
  scannedAt: string;
  lessons: Array<{
    sessionId: string;
    label: string;
    startsAt: string | null;
    endsAt: string | null;
    lateMinutes: number | null;
  }>;
  message: string;
  repeated: boolean;
};

function scanMessage(
  decision: PresenceDecision,
  lessons: PresenceScanResult["lessons"],
  reasons: PresenceScanReason[],
) {
  if (decision === "rejected") {
    return reasons.map((reason) => PRESENCE_SCAN_REASON_LABELS[reason]).join(" · ");
  }
  if (decision === "review") {
    return "Leitura guardada, mas a Direcção tem de a confirmar antes de contar como presença.";
  }
  if (lessons.length === 0) {
    return "Presença na escola registada. Não tem aula a começar agora: leia o QR outra vez no início da aula.";
  }
  return `Presença confirmada: ${lessons.map((lesson) => lesson.label).join(", ")}.`;
}

/**
 * Processa uma leitura do QR da escola por um professor (portal web ou app).
 * Confirma a assinatura, decide (aceite, por rever, recusada), grava e, quando
 * aceite, marca a presença nas aulas abertas a essa hora.
 */
export async function processPresenceScan(
  db: AdminDb,
  input: {
    schoolId: string;
    userId: string;
    teacherId: string;
    scan: z.infer<typeof presenceScanInputSchema>;
    nowMs?: number;
  },
): Promise<PresenceScanResult> {
  const receivedAtMs = input.nowMs ?? Date.now();
  const { available, row: settings } = await loadSchoolPresenceSettings(db, input.schoolId);
  if (!available) throw new Error(SCHOOL_QR_SQL_MISSING_MESSAGE);
  if (!settings) throw new Error("A Direcção ainda não activou o QR da escola.");
  if (settings.mode === "off") {
    throw new Error("A presença por QR está desligada nesta escola.");
  }

  const parsed = parseSchoolQr(input.scan.token);
  if (!parsed) throw new Error("Este código não é o QR de presença do SIGA.");
  if (parsed.schoolId !== input.schoolId.toLowerCase()) {
    throw new Error("Este QR é de outra escola.");
  }
  const version = Number(settings.qr_secret_version);
  let expectedMac: string | null = null;
  if (parsed.kind === "rotating") {
    const date = luandaDateOf(parsed.step * Number(settings.rotation_seconds) * 1000);
    const key = await schoolQrDayKey(settings.qr_secret, date, version);
    expectedMac = await schoolQrMac(key, parsed);
  } else {
    const monday = mondayOfPrintedStep(parsed.step);
    if (monday) {
      const key = await schoolQrWeekKey(settings.qr_secret, monday, version);
      expectedMac = await schoolQrMac(key, parsed);
    }
  }
  if (!expectedMac || !safeEqual(expectedMac, parsed.mac)) {
    throw new Error(
      "QR inválido ou anulado pela Direcção. Leia o QR que está agora no ecrã da escola.",
    );
  }

  // O mesmo envio (fila offline) devolve a leitura já gravada.
  if (input.scan.opId) {
    const { data: previous } = await db
      .from("siga_teacher_presence_scans")
      .select("*")
      .eq("school_id", input.schoolId)
      .eq("client_op_id", input.scan.opId)
      .maybeSingle();
    if (previous) {
      if (String(previous.teacher_id) !== input.teacherId) {
        throw new Error("Este envio pertence a outra conta.");
      }
      const reasons = (previous.reasons ?? []) as PresenceScanReason[];
      return {
        scanId: String(previous.id),
        decision: previous.decision as PresenceDecision,
        reasons,
        reasonLabels: reasons.map((reason) => PRESENCE_SCAN_REASON_LABELS[reason] ?? reason),
        scannedAt: String(previous.scanned_at),
        lessons: [],
        message: "Esta leitura já tinha sido recebida.",
        repeated: true,
      };
    }
  }

  const hasLocation = input.scan.latitude != null && input.scan.longitude != null;
  const outcome = decidePresenceScan(
    {
      kind: parsed.kind,
      step: parsed.step,
      receivedAtMs,
      offline: input.scan.offline,
      deviceScannedAtMs: input.scan.deviceScannedAt ? Date.parse(input.scan.deviceScannedAt) : null,
      deviceNowMs: input.scan.deviceNow ? Date.parse(input.scan.deviceNow) : null,
      location: hasLocation
        ? {
            latitude: Number(input.scan.latitude),
            longitude: Number(input.scan.longitude),
            accuracyM: input.scan.accuracy ?? null,
            mocked: input.scan.mocked ?? null,
          }
        : null,
    },
    {
      rotationSeconds: Number(settings.rotation_seconds),
      allowPrinted: Boolean(settings.allow_printed),
      requireLocation: Boolean(settings.require_location),
      offlineMaxHours: Number(settings.offline_max_hours),
      center:
        settings.center_latitude != null && settings.center_longitude != null
          ? {
              latitude: Number(settings.center_latitude),
              longitude: Number(settings.center_longitude),
            }
          : null,
      radiusM: Number(settings.geofence_radius_m),
    },
  );

  const scanDate = luandaDateOf(outcome.scannedAtMs);
  const scanTime = luandaTimeOfMs(outcome.scannedAtMs);
  let open: TeacherDayLesson[] = [];
  if (outcome.decision !== "rejected") {
    const lessons = await ensureTeacherDaySessions(db, {
      schoolId: input.schoolId,
      teacherId: input.teacherId,
      date: scanDate,
      userId: input.userId,
    });
    open = lessonsOpenAt(lessons, scanTime);
  }

  const confirmed: PresenceScanResult["lessons"] = [];
  if (outcome.decision === "accepted") {
    for (const lesson of open) {
      await recordTeacherCheckin(db, {
        schoolId: input.schoolId,
        sessionId: lesson.sessionId,
        userId: input.userId,
        method: "qr",
        startsAt: lesson.startsAt,
        now: new Date(outcome.scannedAtMs),
      });
    }
    if (open.length) {
      const { data: fresh } = await db
        .from("siga_attendance_sessions")
        .select("*")
        .eq("school_id", input.schoolId)
        .in(
          "id",
          open.map((lesson) => lesson.sessionId),
        );
      const byId = new Map(
        ((fresh ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
      );
      for (const lesson of open) {
        const presence = readTeacherPresence(byId.get(lesson.sessionId) ?? null).fields;
        confirmed.push({
          sessionId: lesson.sessionId,
          label: `${lesson.classGroupName} · ${lesson.subjectName}`,
          startsAt: lesson.startsAt,
          endsAt: lesson.endsAt,
          lateMinutes: presence.teacher_late_minutes,
        });
      }
    }
  }

  const { data: saved, error: saveError } = await db
    .from("siga_teacher_presence_scans")
    .insert({
      school_id: input.schoolId,
      teacher_id: input.teacherId,
      user_id: input.userId,
      qr_kind: parsed.kind,
      qr_step: parsed.step,
      scanned_at: new Date(outcome.scannedAtMs).toISOString(),
      device_scanned_at: input.scan.deviceScannedAt ?? null,
      received_at: new Date(receivedAtMs).toISOString(),
      offline: input.scan.offline,
      distance_m: outcome.distanceM,
      accuracy_m:
        input.scan.accuracy == null ? null : Math.round(Math.min(input.scan.accuracy, 100_000)),
      inside_geofence: outcome.insideGeofence,
      location_mocked: input.scan.mocked ?? null,
      device_id: input.scan.deviceId ?? null,
      client_op_id: input.scan.opId ?? null,
      decision: outcome.decision,
      reasons: outcome.reasons,
      session_ids: open.map((lesson) => lesson.sessionId),
    })
    .select("id")
    .single();
  if (saveError) {
    throw publicDatabaseError(saveError, "Não foi possível registar a leitura do QR.");
  }

  return {
    scanId: saved?.id ? String(saved.id) : null,
    decision: outcome.decision,
    reasons: outcome.reasons,
    reasonLabels: outcome.reasons.map((reason) => PRESENCE_SCAN_REASON_LABELS[reason]),
    scannedAt: new Date(outcome.scannedAtMs).toISOString(),
    lessons: confirmed,
    message: scanMessage(outcome.decision, confirmed, outcome.reasons),
    repeated: false,
  };
}

/** O professor autenticado nesta escola (ficha `teachers` ligada à conta). */
export async function requireTeacherForPresence(
  db: AdminDb,
  userId: string,
  preferredSchoolId?: string | null,
) {
  const membership = await requireSgaWriterForWrite(
    "pedagogica",
    userId,
    ["Professor"],
    preferredSchoolId ?? null,
  );
  const linked = await resolveUserLinkedEntities(db, membership.schoolId, userId);
  if (!linked.teacher_id) {
    throw new Error(
      "A sua conta ainda não está ligada a uma ficha de professor. Peça à secretaria para a ligar em Pessoas.",
    );
  }
  return { membership, teacherId: linked.teacher_id };
}

export const submitPresenceScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => presenceScanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await loadSgaAdminClient();
    const { membership, teacherId } = await requireTeacherForPresence(db, context.userId);
    return processPresenceScan(db, {
      schoolId: membership.schoolId,
      userId: context.userId,
      teacherId,
      scan: data,
    });
  });

// ── Lista e revisão pela Direcção ─────────────────────────────────────────────

export type PresenceScanRow = {
  id: string;
  teacherId: string;
  teacherName: string;
  kind: "rotating" | "printed";
  scannedAt: string;
  receivedAt: string;
  offline: boolean;
  distanceM: number | null;
  accuracyM: number | null;
  insideGeofence: boolean | null;
  locationMocked: boolean | null;
  decision: PresenceDecision;
  reasons: PresenceScanReason[];
  reasonLabels: string[];
  sessionCount: number;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export const listPresenceScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.userId, [...STAFF_ROLES]);
    const db = await loadSgaAdminClient();
    const date = data.date ?? schoolTodayIso();
    // Dia de Luanda (UTC+1): das 23:00 UTC da véspera às 23:00 UTC do dia.
    const from = new Date(Date.parse(`${date}T00:00:00+01:00`)).toISOString();
    const to = new Date(Date.parse(`${addDays(date, 1)}T00:00:00+01:00`)).toISOString();
    const { data: rows, error } = await db
      .from("siga_teacher_presence_scans")
      .select("*")
      .eq("school_id", membership.schoolId)
      .gte("scanned_at", from)
      .lt("scanned_at", to)
      .order("scanned_at", { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingTable(error)) return { date, available: false, scans: [] as PresenceScanRow[] };
      throw publicDatabaseError(error, "Não foi possível ler as leituras do QR.");
    }
    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const teacherIds = [...new Set(list.map((row) => String(row.teacher_id)))];
    const names = new Map<string, string>();
    if (teacherIds.length) {
      const { data: teachers } = await db
        .from("teachers")
        .select("id, person_id")
        .eq("school_id", membership.schoolId)
        .in("id", teacherIds);
      const personIds = ((teachers ?? []) as Array<{ person_id: string | null }>)
        .map((row) => row.person_id)
        .filter((id): id is string => Boolean(id));
      if (personIds.length) {
        const { loadPeopleLite } = await import("@/features/people/lookup");
        const people = await loadPeopleLite(db, membership.schoolId, personIds);
        for (const teacher of (teachers ?? []) as Array<{ id: string; person_id: string | null }>) {
          const name = teacher.person_id ? people.get(teacher.person_id)?.full_name : null;
          if (name) names.set(teacher.id, name);
        }
      }
    }
    const scans: PresenceScanRow[] = list.map((row) => {
      const reasons = ((row.reasons ?? []) as string[]).filter(
        (reason): reason is PresenceScanReason => reason in PRESENCE_SCAN_REASON_LABELS,
      );
      return {
        id: String(row.id),
        teacherId: String(row.teacher_id),
        teacherName: names.get(String(row.teacher_id)) ?? "Professor",
        kind: row.qr_kind === "printed" ? "printed" : "rotating",
        scannedAt: String(row.scanned_at),
        receivedAt: String(row.received_at),
        offline: Boolean(row.offline),
        distanceM: row.distance_m == null ? null : Number(row.distance_m),
        accuracyM: row.accuracy_m == null ? null : Number(row.accuracy_m),
        insideGeofence: row.inside_geofence == null ? null : Boolean(row.inside_geofence),
        locationMocked: row.location_mocked == null ? null : Boolean(row.location_mocked),
        decision: row.decision as PresenceDecision,
        reasons,
        reasonLabels: reasons.map((reason) => PRESENCE_SCAN_REASON_LABELS[reason]),
        sessionCount: Array.isArray(row.session_ids) ? row.session_ids.length : 0,
        reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
        reviewNote: row.review_note ? String(row.review_note) : null,
      };
    });
    return { date, available: true, scans };
  });

export const reviewPresenceScanInputSchema = z.object({
  scanId: z.string().uuid(),
  decision: z.enum(["accepted", "rejected"]),
  note: z.string().trim().min(5, "Indique o motivo (pelo menos 5 caracteres).").max(500),
});

export const reviewPresenceScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewPresenceScanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pedagogica", context.userId, [
      ...STAFF_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const { data: scan, error } = await db
      .from("siga_teacher_presence_scans")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("id", data.scanId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível abrir a leitura.");
    if (!scan) throw new Error("Leitura não encontrada.");
    if (scan.decision !== "review") throw new Error("Esta leitura já foi decidida.");

    const { data: updated, error: updateError } = await db
      .from("siga_teacher_presence_scans")
      .update({
        decision: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note,
      })
      .eq("school_id", membership.schoolId)
      .eq("id", data.scanId)
      .eq("decision", "review")
      .select("id")
      .maybeSingle();
    if (updateError) throw publicDatabaseError(updateError, "Não foi possível guardar a decisão.");
    if (!updated) throw new Error("Esta leitura já foi decidida.");

    // Confirmada: as aulas abertas na hora da leitura ficam com a presença (hora do QR).
    let marked = 0;
    if (data.decision === "accepted") {
      const sessionIds = (scan.session_ids ?? []) as string[];
      if (sessionIds.length) {
        const { data: sessions } = await db
          .from("siga_attendance_sessions")
          .select("id, starts_at")
          .eq("school_id", membership.schoolId)
          .in("id", sessionIds);
        for (const session of (sessions ?? []) as Array<{
          id: string;
          starts_at: string | null;
        }>) {
          const recorded = await recordTeacherCheckin(db, {
            schoolId: membership.schoolId,
            sessionId: session.id,
            userId: context.userId,
            method: "qr",
            startsAt: session.starts_at,
            now: new Date(String(scan.scanned_at)),
            note: `Leitura confirmada pela Direcção: ${data.note}`,
          });
          if (recorded) marked += 1;
        }
      }
    }
    return { scanId: data.scanId, decision: data.decision, marked };
  });

// ── App Flutter (/api/mobile/presence) ────────────────────────────────────────

/** Modo da escola e aulas de hoje do professor autenticado por Bearer. */
export async function mobilePresenceToday(userId: string, schoolId: string) {
  const db = await loadSgaAdminClient();
  const { membership, teacherId } = await requireTeacherForPresence(db, userId, schoolId);
  const today = schoolTodayIso();
  const [mode, lessons] = await Promise.all([
    loadSchoolPresenceMode(db, membership.schoolId),
    ensureTeacherDaySessions(db, { schoolId: membership.schoolId, teacherId, date: today, userId }),
  ]);
  return { schoolId: membership.schoolId, mode, date: today, serverNow: Date.now(), lessons };
}

/** Leitura do QR enviada pela app (já ou da fila sem rede). */
export async function mobilePresenceSubmit(
  userId: string,
  schoolId: string,
  scan: z.infer<typeof presenceScanInputSchema>,
) {
  const db = await loadSgaAdminClient();
  const { membership, teacherId } = await requireTeacherForPresence(db, userId, schoolId);
  return processPresenceScan(db, { schoolId: membership.schoolId, userId, teacherId, scan });
}
