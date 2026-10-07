import type { SupabaseClient } from "@supabase/supabase-js";

/** Estados de aluno que deixam passar na catraca. */
export const GATE_ALLOWED_STUDENT_STATUSES = new Set(["active", "applicant"]);

const STUDENT_STATUS_PT: Record<string, string> = {
  inactive: "inactivo",
  transferred: "transferido",
  graduated: "que já concluiu",
  cancelled: "com matrícula cancelada",
  suspended: "suspenso",
  locked: "bloqueado",
};

export type GatePassCardRow = {
  id: string;
  person_id: string;
  student_id: string | null;
  status: string;
  card_number: string;
};

export type GatePassEvaluation = {
  granted: boolean;
  reason?: string;
  personName?: string;
  photoUrl?: string | null;
  cardNumber?: string;
  cardId?: string;
  personId?: string;
  studentId?: string | null;
  direction?: "entry" | "exit";
  timestamp?: string;
};

export type GatePassDeviceContext = {
  deviceId: string | null;
  deviceName: string;
  blockPassage?: boolean;
};

/** Resolve dispositivo por UUID (UI autenticada) dentro da escola. */
export async function resolveGatePassDevice(
  db: SupabaseClient,
  schoolId: string,
  options: { deviceId?: string | null },
): Promise<GatePassDeviceContext> {
  if (options.deviceId) {
    const { data: dev } = await db
      .from("siga_turnstile_devices")
      .select("id, name, status")
      .eq("id", options.deviceId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (dev) {
      const blocked = dev.status === "maintenance" || dev.status === "offline";
      return {
        deviceId: dev.id,
        deviceName: dev.name,
        blockPassage: blocked,
      };
    }
  }

  return { deviceId: options.deviceId ?? null, deviceName: "Catraca Portaria" };
}

/** Resolve dispositivo + escola a partir da API key (webhook físico). */
export async function resolveGatePassDeviceByApiKey(
  db: SupabaseClient,
  apiKey: string,
): Promise<(GatePassDeviceContext & { schoolId: string }) | null> {
  const { data: dev } = await db
    .from("siga_turnstile_devices")
    .select("id, name, status, school_id")
    .eq("api_key", apiKey.trim())
    .maybeSingle();
  if (!dev) return null;
  return {
    schoolId: dev.school_id,
    deviceId: dev.id,
    deviceName: dev.name,
    blockPassage: dev.status === "maintenance" || dev.status === "offline",
  };
}

/**
 * Que identificadores do cartão abrem a passagem.
 *
 * - `secret` (leitor físico, sem sessão): só o QR (`qr_secret`) e a tag RFID. O número
 *   e o "código de barras" estão impressos em texto no cartão — quem visse um cartão
 *   podia escrevê-los num leitor e passar com ele.
 * - `staff` (portaria com sessão SIGA): também aceita o número e o código impressos,
 *   para a entrada manual por um funcionário.
 */
export type GatePassTokenScope = "secret" | "staff";

export async function findGatePassCard(
  db: SupabaseClient,
  schoolId: string,
  tokens: string[],
  scope: GatePassTokenScope = "secret",
): Promise<GatePassCardRow | null> {
  for (const token of tokens) {
    const filter =
      scope === "staff"
        ? `card_number.eq.${token},barcode.eq.${token},qr_secret.eq.${token},rfid_tag.eq.${token}`
        : `qr_secret.eq.${token},rfid_tag.eq.${token}`;
    const { data: found } = await db
      .from("siga_access_cards")
      .select("id, person_id, student_id, status, card_number")
      .eq("school_id", schoolId)
      .or(filter)
      .maybeSingle();
    if (found) return found;
  }
  return null;
}

async function insertAccessLog(
  db: SupabaseClient,
  row: {
    school_id: string;
    person_id?: string | null;
    student_id?: string | null;
    card_id?: string | null;
    device_id?: string | null;
    device_name: string;
    direction: "entry" | "exit";
    status: "granted" | "denied";
    denial_reason?: string | null;
  },
) {
  await db.from("siga_access_logs").insert(row);
}

/** Avalia token de cartão/QR/RFID e regista log de acesso. */
export async function evaluateGatePassAccess(
  db: SupabaseClient,
  schoolId: string,
  tokens: string[],
  direction: "entry" | "exit",
  device: GatePassDeviceContext,
  scope: GatePassTokenScope = "secret",
): Promise<GatePassEvaluation> {
  if (device.blockPassage) {
    return {
      granted: false,
      reason: "Dispositivo offline ou em manutenção — passagem bloqueada.",
    };
  }

  const card = await findGatePassCard(db, schoolId, tokens, scope);

  if (!card) {
    await insertAccessLog(db, {
      school_id: schoolId,
      device_id: device.deviceId,
      device_name: device.deviceName,
      direction,
      status: "denied",
      denial_reason: "Cartão / Token não reconhecido.",
    });
    return {
      granted: false,
      reason: "Cartão ou QR Code não reconhecido pelo sistema de catracas.",
    };
  }

  if (card.status !== "active") {
    await insertAccessLog(db, {
      school_id: schoolId,
      person_id: card.person_id,
      student_id: card.student_id,
      card_id: card.id,
      device_id: device.deviceId,
      device_name: device.deviceName,
      direction,
      status: "denied",
      denial_reason: `Cartão com estado: ${card.status}`,
    });
    return {
      granted: false,
      reason: `Acesso negado: cartão ${card.status === "suspended" ? "suspenso" : "inactivo"}.`,
    };
  }

  if (card.student_id) {
    const { data: student } = await db
      .from("students")
      .select("id, status")
      .eq("id", card.student_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    // Só o aluno activo (ou candidato) passa. Antes só «inactivo» era barrado:
    // transferido, concluído, cancelado, suspenso ou bloqueado continuavam a entrar
    // com o cartão, e um aluno apagado também (auditoria 13).
    const studentStatus = student?.status ? String(student.status) : null;
    if (!studentStatus || !GATE_ALLOWED_STUDENT_STATUSES.has(studentStatus)) {
      await insertAccessLog(db, {
        school_id: schoolId,
        person_id: card.person_id,
        student_id: card.student_id,
        card_id: card.id,
        device_id: device.deviceId,
        device_name: device.deviceName,
        direction,
        status: "denied",
        denial_reason: studentStatus
          ? `Aluno com estado: ${studentStatus}`
          : "Aluno não encontrado",
      });
      return {
        granted: false,
        reason: `Acesso negado: aluno ${STUDENT_STATUS_PT[studentStatus ?? ""] ?? "sem ficha activa"}.`,
      };
    }
  }

  const { loadPeopleLite } = await import("@/features/people/lookup");
  const peopleMap = await loadPeopleLite(db, schoolId, [card.person_id]);
  const person = peopleMap.get(card.person_id);

  await insertAccessLog(db, {
    school_id: schoolId,
    person_id: card.person_id,
    student_id: card.student_id,
    card_id: card.id,
    device_id: device.deviceId,
    device_name: device.deviceName,
    direction,
    status: "granted",
  });

  return {
    granted: true,
    personName: person?.full_name ?? "Estudante",
    photoUrl: person?.photo_url ?? null,
    cardNumber: card.card_number,
    cardId: card.id,
    personId: card.person_id,
    studentId: card.student_id,
    direction,
    timestamp: new Date().toISOString(),
  };
}
