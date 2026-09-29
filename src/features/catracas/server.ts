import type { TablesUpdate } from "@/integrations/supabase/types";
import { z } from "zod";
import { resolveVerifiedAccountEmail } from "@/features/students/student-scope";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { resolveUserLinkedEntities } from "@/features/auth/server";
import {
  issueAccessCardInputSchema,
  validateGatePassTokenInputSchema,
  registerTurnstileDeviceInputSchema,
  listAccessLogsInputSchema,
  setAccessCardStatusInputSchema,
  updateTurnstileDeviceInputSchema,
  linkAccessCardRfidInputSchema,
  rotateAccessCardQrInputSchema,
  listAccessCardsInputSchema,
  validateGatePassDeviceInputSchema,
  revealTurnstileDeviceApiKeyInputSchema,
} from "./schemas";
import {
  gatePassLookupTokens,
  generateAccessCardIdentifiers,
  normalizeRfidTag,
} from "./gate-pass-token";
import { evaluateGatePassAccess, resolveGatePassDevice } from "./gate-pass-validation";
import { runDeviceGatePassWebhook } from "./device-webhook-handler";

export interface GateEntryRecord {
  student_id: string | null;
  person_id: string | null;
  created_at: string;
}

export type AttendanceAnomaly = {
  studentId: string;
  studentName: string;
  gateEntryTime: string;
  issueType: "present_at_gate_absent_in_class" | "late_gate_entry";
  severity: "high" | "medium";
  description: string;
};

/**
 * Cruza entradas na catraca com o registo de presença da sala de aula do mesmo dia. Um aluno que
 * entrou no recinto mas foi marcado ausente na aula, ou que só bateu o cartão depois das 08:00,
 * é sinalizado como anomalia para a secretaria investigar.
 */
export function detectAttendanceAnomalies(
  gateEntries: GateEntryRecord[],
  classStatusByStudentId: Map<string, string>,
  personNameByPersonId: Map<string, string>,
): AttendanceAnomaly[] {
  const enteredStudentIds = [
    ...new Set(gateEntries.filter((g) => g.student_id).map((g) => g.student_id!)),
  ];

  return enteredStudentIds
    .map((stId): AttendanceAnomaly | null => {
      const entry = gateEntries.find((g) => g.student_id === stId);
      const classStatus = classStatusByStudentId.get(stId);
      const personName = entry?.person_id
        ? (personNameByPersonId.get(entry.person_id) ?? "Estudante")
        : "Estudante";
      const gateEntryTime = entry ? new Date(entry.created_at).toLocaleTimeString("pt-PT") : "—";

      if (classStatus === "absent") {
        return {
          studentId: stId,
          studentName: personName,
          gateEntryTime,
          issueType: "present_at_gate_absent_in_class",
          severity: "high",
          description: "Entrou no recinto da escola mas foi marcado Ausente na sala de aula.",
        };
      }

      const entryHour = entry ? new Date(entry.created_at).getHours() : 0;
      if (entryHour >= 8) {
        return {
          studentId: stId,
          studentName: personName,
          gateEntryTime,
          issueType: "late_gate_entry",
          severity: "medium",
          description: "Entrou na portaria após o início das aulas (depois das 08:00).",
        };
      }

      return null;
    })
    .filter((x): x is AttendanceAnomaly => x !== null);
}

type LinkedEntities = {
  person_id?: string | null;
  student_id?: string | null;
  linked_students: { student_id: string }[];
};

/** De quem é o cartão que esta conta pode ver ou criar. */
export function virtualCardScope(
  role: string,
  requested: { studentId?: string; personId?: string },
  linked: LinkedEntities,
): { personId: string | null; studentId: string | null } {
  if (role === "Administrador" || role === "Secretaria") {
    return {
      personId: requested.personId || linked.person_id || null,
      studentId: requested.studentId || linked.student_id || null,
    };
  }
  if (role === "Encarregado") {
    const allowedIds = linked.linked_students.map((s) => s.student_id);
    const studentId = requested.studentId ?? allowedIds[0] ?? null;
    if (requested.personId || (studentId && !allowedIds.includes(studentId))) {
      throw new Error("Sem permissão para consultar o cartão deste educando.");
    }
    return { personId: null, studentId };
  }
  const ownStudent = linked.student_id ?? null;
  const ownPerson = linked.person_id ?? null;
  if (
    (requested.studentId && requested.studentId !== ownStudent) ||
    (requested.personId && requested.personId !== ownPerson)
  ) {
    throw new Error("Sem permissão para consultar o cartão de outra pessoa.");
  }
  return { personId: ownPerson, studentId: ownStudent };
}

export const getOrCreateVirtualCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        studentId: z.string().uuid().optional(),
        personId: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();

    const linked = await resolveUserLinkedEntities(
      db,
      membership.schoolId,
      context.userId,
      await resolveVerifiedAccountEmail(db, context.userId),
    );
    // O cartão traz o segredo do QR, que abre a catraca. Só a secretaria e a
    // administração escolhem de quem é o cartão; os outros vêem só o seu (e o
    // encarregado, o dos educandos).
    const scope = virtualCardScope(membership.appRole, data, linked);
    let personId = scope.personId;
    const studentId = scope.studentId;

    if (studentId && !personId) {
      const { data: st } = await db
        .from("students")
        .select("person_id")
        .eq("id", studentId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (!st) throw new Error("Aluno não encontrado nesta escola.");
      personId = st.person_id;
    }

    if (!personId) throw new Error("Pessoa não identificada para emissão de cartão.");

    const { data: existingCard } = await db
      .from("siga_access_cards")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("person_id", personId)
      .eq("status", "active")
      .maybeSingle();

    if (existingCard) {
      return existingCard;
    }

    const { cardNumber, barcode } = generateAccessCardIdentifiers();
    const qrSecret = crypto.randomUUID();

    const { data: created, error } = await db
      .from("siga_access_cards")
      .insert({
        school_id: membership.schoolId,
        person_id: personId,
        student_id: studentId ?? null,
        card_number: cardNumber,
        barcode,
        qr_secret: qrSecret,
        status: "active",
      })
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível gerar o cartão virtual.");
    return created;
  });

export const validateGatePassToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => validateGatePassTokenInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const tokens = gatePassLookupTokens(data.token);
    if (tokens.length === 0) {
      return { granted: false, reason: "Token ou código inválido." };
    }

    const device = await resolveGatePassDevice(db, membership.schoolId, {
      deviceId: data.deviceId,
    });

    if (device.blockPassage) {
      return {
        granted: false,
        reason: "Dispositivo em manutenção ou offline — passagem bloqueada.",
      };
    }

    return evaluateGatePassAccess(db, membership.schoolId, tokens, data.direction, device);
  });

/** Webhook para leitores físicos — autenticação via api_key (sem login SIGA). */
export const validateGatePassByDeviceApiKey = createServerFn({ method: "POST" })
  .validator((input: unknown) => validateGatePassDeviceInputSchema.parse(input))
  .handler(async ({ data }) => runDeviceGatePassWebhook(data));

/** Colunas de `siga_turnstile_devices` que podem sair para o browser (sem `api_key`). */
const TURNSTILE_DEVICE_COLUMNS =
  "id, school_id, name, location, device_type, direction_capability, ip_address, mac_address, status, last_ping_at, created_at";

type TurnstileDeviceWithKey = Record<string, unknown> & { api_key?: string | null };

/** Tira a chave e deixa só os últimos 4 caracteres para a identificar. */
export function withoutApiKey<T extends TurnstileDeviceWithKey>(row: T) {
  const { api_key: apiKey, ...rest } = row;
  const key = typeof apiKey === "string" ? apiKey : "";
  return { ...rest, has_api_key: key.length > 0, api_key_hint: key ? key.slice(-4) : null };
}

export const listTurnstileDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: devices, error } = await db
      .from("siga_turnstile_devices")
      .select(`${TURNSTILE_DEVICE_COLUMNS}, api_key`)
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false });

    if (error) throw publicDatabaseError(error, "Não foi possível listar as catracas.");
    return (devices ?? []).map(withoutApiKey);
  });

/**
 * Chave completa de um dispositivo, só a pedido (botão "Key"). A listagem
 * devolve apenas os últimos 4 caracteres, para a chave não andar em todas as
 * respostas nem na cache do browser. Exige escrita: quem só tem "Leitura" em
 * Gestão vê a lista mas não leva a chave.
 */
export const revealTurnstileDeviceApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => revealTurnstileDeviceApiKeyInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: device, error } = await db
      .from("siga_turnstile_devices")
      .select("api_key")
      .eq("id", data.deviceId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();

    if (error) throw publicDatabaseError(error, "Não foi possível ler a chave do dispositivo.");
    if (!device?.api_key) throw new Error("Este dispositivo não tem API key.");
    return { apiKey: String(device.api_key) };
  });

export const registerTurnstileDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => registerTurnstileDeviceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: created, error } = await db
      .from("siga_turnstile_devices")
      .insert({
        school_id: membership.schoolId,
        name: data.name.trim(),
        location: data.location.trim(),
        device_type: data.deviceType,
        direction_capability: data.directionCapability,
        ip_address: data.ipAddress ?? null,
        mac_address: data.macAddress ?? null,
        api_key: `KEY-${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`,
        status: "online",
        last_ping_at: new Date().toISOString(),
      })
      .select(`${TURNSTILE_DEVICE_COLUMNS}, api_key`)
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível registar o dispositivo.");
    return withoutApiKey(created);
  });

export const updateTurnstileDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateTurnstileDeviceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();

    const patch: TablesUpdate<"siga_turnstile_devices"> = {};
    if (data.status) patch.status = data.status;
    if (data.ipAddress !== undefined) patch.ip_address = data.ipAddress?.trim() || null;
    if (data.name) patch.name = data.name.trim();
    if (data.location) patch.location = data.location.trim();
    if (Object.keys(patch).length === 0) throw new Error("Nada para actualizar.");
    if (data.status === "online") patch.last_ping_at = new Date().toISOString();

    const { data: updated, error } = await db
      .from("siga_turnstile_devices")
      .update(patch)
      .eq("id", data.deviceId)
      .eq("school_id", membership.schoolId)
      .select(`${TURNSTILE_DEVICE_COLUMNS}, api_key`)
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o dispositivo.");
    return withoutApiKey(updated);
  });

export const setAccessCardStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setAccessCardStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();

    const { data: updated, error } = await db
      .from("siga_access_cards")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.cardId)
      .eq("school_id", membership.schoolId)
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o cartão.");
    return updated;
  });

export const linkAccessCardRfid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkAccessCardRfidInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();

    const raw = data.rfidTag == null ? "" : String(data.rfidTag);
    const normalized = raw.trim() ? normalizeRfidTag(raw) : null;
    if (normalized && normalized.length < 3) {
      throw new Error("RFID deve ter pelo menos 3 caracteres.");
    }

    if (normalized) {
      const { data: clash } = await db
        .from("siga_access_cards")
        .select("id, card_number")
        .eq("school_id", membership.schoolId)
        .eq("rfid_tag", normalized)
        .neq("id", data.cardId)
        .maybeSingle();
      if (clash) {
        throw new Error(`Esta tag RFID já está ligada ao cartão ${clash.card_number}.`);
      }
    }

    const { data: updated, error } = await db
      .from("siga_access_cards")
      .update({ rfid_tag: normalized, updated_at: new Date().toISOString() })
      .eq("id", data.cardId)
      .eq("school_id", membership.schoolId)
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível ligar a tag RFID.");
    return updated;
  });

export const rotateAccessCardQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => rotateAccessCardQrInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();

    const { data: updated, error } = await db
      .from("siga_access_cards")
      .update({
        qr_secret: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.cardId)
      .eq("school_id", membership.schoolId)
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível renovar o QR do cartão.");
    return updated;
  });

export const issueAccessCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => issueAccessCardInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();

    const { data: existing } = await db
      .from("siga_access_cards")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("person_id", data.personId)
      .eq("status", "active")
      .maybeSingle();
    if (existing) return existing;

    const rfid = data.rfidTag && data.rfidTag.trim() ? normalizeRfidTag(data.rfidTag) : null;
    if (rfid) {
      const { data: clash } = await db
        .from("siga_access_cards")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("rfid_tag", rfid)
        .maybeSingle();
      if (clash) throw new Error("Tag RFID já associada a outro cartão.");
    }

    const { cardNumber, barcode } = generateAccessCardIdentifiers();

    const { data: created, error } = await db
      .from("siga_access_cards")
      .insert({
        school_id: membership.schoolId,
        person_id: data.personId,
        student_id: data.studentId ?? null,
        card_number: cardNumber,
        barcode,
        qr_secret: crypto.randomUUID(),
        rfid_tag: rfid,
        status: "active",
      })
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível emitir o cartão.");
    return created;
  });

export const listAccessCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAccessCardsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    let query = db
      .from("siga_access_cards")
      .select("*")
      .eq("school_id", membership.schoolId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);

    if (data.status) query = query.eq("status", data.status);

    const search = data.search?.trim().replace(/[%_,]/g, "");
    if (search) {
      query = query.or(
        `card_number.ilike.%${search}%,barcode.ilike.%${search}%,rfid_tag.ilike.%${search}%`,
      );
    }

    const { data: cards, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível listar os cartões.");

    const personIds = [...new Set((cards ?? []).map((c) => c.person_id))];
    const { loadPeopleLite } = await import("@/features/people/lookup");
    const peopleMap = personIds.length
      ? await loadPeopleLite(db, membership.schoolId, personIds)
      : new Map();

    return (cards ?? []).map((c) => ({
      id: c.id,
      card_number: c.card_number,
      barcode: c.barcode,
      rfid_tag: c.rfid_tag,
      status: c.status,
      student_id: c.student_id,
      person_id: c.person_id,
      person_name: peopleMap.get(c.person_id)?.full_name ?? "Pessoa",
      updated_at: c.updated_at,
    }));
  });

export const listAccessLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAccessLogsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    let query = db
      .from("siga_access_logs")
      .select("*")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.studentId) query = query.eq("student_id", data.studentId);
    if (data.status) query = query.eq("status", data.status);
    if (data.direction) query = query.eq("direction", data.direction);
    if (data.deviceId) query = query.eq("device_id", data.deviceId);

    const { data: logs, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os registos de acesso.");

    const personIds = [
      ...new Set((logs ?? []).filter((l) => l.person_id).map((l) => l.person_id!)),
    ];
    const { loadPeopleLite } = await import("@/features/people/lookup");
    const peopleMap = personIds.length
      ? await loadPeopleLite(db, membership.schoolId, personIds)
      : new Map();

    return (logs ?? []).map((l) => ({
      id: l.id,
      person_name: l.person_id
        ? (peopleMap.get(l.person_id)?.full_name ?? "Pessoa")
        : "Desconhecido",
      direction: l.direction,
      status: l.status,
      denial_reason: l.denial_reason,
      device_name: l.device_name ?? "Portaria",
      timestamp: l.created_at,
    }));
  });

export const exportGatePassOfflineList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: cards, error } = await db
      .from("siga_access_cards")
      .select(
        "id, person_id, student_id, card_number, barcode, qr_secret, rfid_tag, status, expires_at",
      )
      .eq("school_id", membership.schoolId)
      .eq("status", "active");

    if (error)
      throw publicDatabaseError(error, "Não foi possível exportar a lista offline de catracas.");

    return {
      schoolId: membership.schoolId,
      exportedAt: new Date().toISOString(),
      totalCards: cards?.length ?? 0,
      cards: cards ?? [],
    };
  });

export const getCampusVsClassroomReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const todayStr = new Date().toISOString().slice(0, 10);

    const { data: gateEntries } = await db
      .from("siga_access_logs")
      .select("student_id, person_id, created_at, direction, status")
      .eq("school_id", membership.schoolId)
      .eq("direction", "entry")
      .eq("status", "granted")
      .gte("created_at", `${todayStr}T00:00:00.000Z`);

    // A data da aula vive na sessão (`siga_attendance_sessions.lesson_date`), não no
    // registo: `siga_attendance_records` não tem coluna `date`, e filtrar por ela fazia o
    // PostgREST recusar a consulta — o painel das catracas mostrava sempre a presença em
    // aula por resolver. Resolve-se em dois passos, sem depender do nome da relação.
    const { data: todaySessions } = await db
      .from("siga_attendance_sessions")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("lesson_date", todayStr);

    const todaySessionIds = (todaySessions ?? []).map((s) => s.id as string);
    const { data: classRecords } = todaySessionIds.length
      ? await db
          .from("siga_attendance_records")
          .select("student_id, status, session_id")
          .eq("school_id", membership.schoolId)
          .in("session_id", todaySessionIds)
      : { data: [] };

    const { loadPeopleLite } = await import("@/features/people/lookup");
    const personIds = (gateEntries ?? []).filter((g) => g.person_id).map((g) => g.person_id!);
    const peopleMap = personIds.length
      ? await loadPeopleLite(db, membership.schoolId, personIds)
      : new Map();
    const personNameByPersonId = new Map(
      [...peopleMap].map(([id, person]) => [id, person.full_name]),
    );

    const classStatusMap = new Map<string, string>();
    (classRecords ?? []).forEach((r) => {
      classStatusMap.set(r.student_id, r.status);
    });

    const anomalies = detectAttendanceAnomalies(
      gateEntries ?? [],
      classStatusMap,
      personNameByPersonId,
    );
    const totalCampusEntriesToday = new Set(
      (gateEntries ?? []).filter((g) => g.student_id).map((g) => g.student_id!),
    ).size;

    return {
      date: todayStr,
      totalCampusEntriesToday,
      anomaliesFound: anomalies.length,
      anomalies,
    };
  });
