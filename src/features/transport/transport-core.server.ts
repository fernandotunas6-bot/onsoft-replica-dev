/**
 * Transporte escolar — lógica do servidor, partilhada pelo portal
 * (`server.ts`) e pela API Mobile V4 (`mobile-v4/transport.server.ts`).
 *
 * As cinco tabelas são só do servidor (FORCE RLS, sem acesso de
 * authenticated): quem chama já confirmou a sessão, a escola e o papel, e
 * passa aqui o cliente de serviço. Todas as leituras e escritas filtram por
 * `school_id`; ids vindos do cliente são sempre confirmados contra a escola.
 *
 * Sem a migração `20261018120000_school_transport.sql` aplicada, as leituras
 * respondem `available: false` e as escritas `TRANSPORT_NOT_READY`.
 */
import type {
  AssignStudentsInput,
  EndAssignmentInput,
  SaveRouteInput,
  SaveStopsInput,
  SaveVehicleInput,
  SetDayStatusInput,
} from "./schemas";

// As tabelas ainda não estão em `types.ts` (gerado depois de aplicar a
// migração): cliente sem tipos, como em `mobile-v4/submissions.server.ts`.
export type TransportDb = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: DbError;
  }>;
};

type DbError = { code?: string; message?: string } | null;

export const TRANSPORT_ERRORS = {
  TRANSPORT_NOT_READY:
    "O transporte escolar ainda não está activo nesta escola (falta aplicar a migração).",
  TRANSPORT_UNAVAILABLE: "Não foi possível ler o transporte escolar. Tente novamente.",
  VEHICLE_NOT_FOUND: "Viatura não encontrada nesta escola.",
  ROUTE_NOT_FOUND: "Rota não encontrada nesta escola.",
  STOP_NOT_FOUND: "A paragem não pertence a esta rota.",
  ASSIGNMENT_NOT_FOUND: "Atribuição não encontrada nesta escola.",
  STUDENT_NOT_FOUND: "Há alunos que não são desta escola.",
  PLATE_TAKEN: "Já existe uma viatura com esta matrícula.",
  ROUTE_NAME_TAKEN: "Já existe uma rota com este nome.",
  STOP_IN_USE: "Há alunos atribuídos a uma paragem que tentou apagar. Mude-os de paragem primeiro.",
  ROUTE_INACTIVE: "A rota está inactiva.",
  SAVE_FAILED: "Não foi possível gravar. Tente novamente.",
} as const;
export type TransportErrorCode = keyof typeof TRANSPORT_ERRORS;

export class TransportError extends Error {
  constructor(readonly code: TransportErrorCode) {
    super(TRANSPORT_ERRORS[code]);
    this.name = "TransportError";
  }
}

function isMissingTable(error: DbError) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /siga_transport_|does not exist|schema cache/i.test(error.message ?? "")
  );
}

function fail(error: DbError, fallback: TransportErrorCode = "SAVE_FAILED"): never {
  if (isMissingTable(error)) throw new TransportError("TRANSPORT_NOT_READY");
  throw new TransportError(fallback);
}

/** Falha fechado antes de qualquer escrita, sem efeitos se a migração faltar. */
async function assertReady(db: TransportDb) {
  const probe = await db.from("siga_transport_routes").select("id").limit(1);
  if (probe.error) fail(probe.error, "TRANSPORT_UNAVAILABLE");
}

// ---------------------------------------------------------------- tipos

export type TransportVehicle = {
  id: string;
  plate: string;
  label: string;
  seats: number;
  driverName: string | null;
  driverPhone: string | null;
  isActive: boolean;
};
export type TransportStop = {
  id: string;
  sequence: number;
  name: string;
  landmark: string | null;
  outboundTime: string | null;
  returnTime: string | null;
};
export type TransportDay = {
  status: "normal" | "delayed" | "cancelled";
  delayMinutes: number;
  note: string | null;
};
export type TransportRoute = {
  id: string;
  name: string;
  direction: "outbound" | "return" | "both";
  vehicleId: string | null;
  isActive: boolean;
  stops: TransportStop[];
  studentCount: number;
  today: TransportDay;
};
export type TransportAssignment = {
  id: string;
  routeId: string;
  stopId: string;
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  validFrom: string;
  validUntil: string | null;
};
export type TransportOverview =
  | { available: false }
  | {
      available: true;
      today: string;
      vehicles: TransportVehicle[];
      routes: TransportRoute[];
      assignments: TransportAssignment[];
    };

const NORMAL_DAY: TransportDay = { status: "normal", delayMinutes: 0, note: null };
const hhmm = (v: unknown) => (typeof v === "string" && v.length >= 5 ? v.slice(0, 5) : null);

function toStop(row: Record<string, unknown>): TransportStop {
  return {
    id: String(row.id),
    sequence: Number(row.sequence),
    name: String(row.name),
    landmark: (row.landmark as string | null) ?? null,
    outboundTime: hhmm(row.outbound_time),
    returnTime: hhmm(row.return_time),
  };
}
function toDay(row: Record<string, unknown> | undefined): TransportDay {
  if (!row) return NORMAL_DAY;
  return {
    status: row.status as TransportDay["status"],
    delayMinutes: Number(row.delay_minutes ?? 0),
    note: (row.note as string | null) ?? null,
  };
}
function toVehicle(row: Record<string, unknown>): TransportVehicle {
  return {
    id: String(row.id),
    plate: String(row.plate),
    label: String(row.label),
    seats: Number(row.seats),
    driverName: (row.driver_name as string | null) ?? null,
    driverPhone: (row.driver_phone as string | null) ?? null,
    isActive: row.is_active !== false,
  };
}

/** Atribuição em vigor no dia: começou e ainda não terminou. */
export function isAssignmentOpen(
  row: { valid_from: string; valid_until: string | null },
  day: string,
) {
  return row.valid_from <= day && (row.valid_until === null || row.valid_until >= day);
}

/** Nome e número de cada aluno (students → people), só desta escola. */
async function studentNames(db: TransportDb, schoolId: string, studentIds: string[]) {
  const names = new Map<string, { name: string; number: string | null; personId: string }>();
  for (let i = 0; i < studentIds.length; i += 200) {
    const students = await db
      .from("students")
      .select("id, person_id, student_number")
      .eq("school_id", schoolId)
      .in("id", studentIds.slice(i, i + 200));
    if (students.error) fail(students.error, "TRANSPORT_UNAVAILABLE");
    const rows = (students.data ?? []) as {
      id: string;
      person_id: string;
      student_number: string | null;
    }[];
    const people = await db
      .from("people")
      .select("id, full_name")
      .eq("school_id", schoolId)
      .in(
        "id",
        rows.map((r) => r.person_id),
      );
    if (people.error) fail(people.error, "TRANSPORT_UNAVAILABLE");
    const byPerson = new Map(
      ((people.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]),
    );
    for (const r of rows) {
      names.set(r.id, {
        name: byPerson.get(r.person_id) ?? "Aluno",
        number: r.student_number,
        personId: r.person_id,
      });
    }
  }
  return names;
}

// ---------------------------------------------------------------- leitura (portal)

export async function readTransportOverview(
  db: TransportDb,
  schoolId: string,
  today: string,
): Promise<TransportOverview> {
  const [vehicles, routes, stops, assignments, days] = await Promise.all([
    db.from("siga_transport_vehicles").select("*").eq("school_id", schoolId).order("label"),
    db.from("siga_transport_routes").select("*").eq("school_id", schoolId).order("name"),
    db.from("siga_transport_stops").select("*").eq("school_id", schoolId).order("sequence"),
    db
      .from("siga_transport_assignments")
      .select("id, route_id, stop_id, student_id, valid_from, valid_until")
      .eq("school_id", schoolId)
      .limit(5000),
    db
      .from("siga_transport_day_status")
      .select("*")
      .eq("school_id", schoolId)
      .eq("service_date", today),
  ]);
  const failed = [vehicles, routes, stops, assignments, days].find((r) => r.error);
  if (failed) {
    if (isMissingTable(failed.error)) return { available: false };
    throw new TransportError("TRANSPORT_UNAVAILABLE");
  }
  const open = (
    (assignments.data ?? []) as {
      id: string;
      route_id: string;
      stop_id: string;
      student_id: string;
      valid_from: string;
      valid_until: string | null;
    }[]
  ).filter((a) => isAssignmentOpen(a, today));
  const names = await studentNames(db, schoolId, [...new Set(open.map((a) => a.student_id))]);
  const stopsByRoute = new Map<string, TransportStop[]>();
  for (const row of (stops.data ?? []) as Record<string, unknown>[]) {
    const list = stopsByRoute.get(String(row.route_id)) ?? [];
    list.push(toStop(row));
    stopsByRoute.set(String(row.route_id), list);
  }
  const dayByRoute = new Map(
    ((days.data ?? []) as Record<string, unknown>[]).map((d) => [String(d.route_id), d]),
  );
  return {
    available: true,
    today,
    vehicles: ((vehicles.data ?? []) as Record<string, unknown>[]).map(toVehicle),
    routes: ((routes.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      direction: r.direction as TransportRoute["direction"],
      vehicleId: (r.vehicle_id as string | null) ?? null,
      isActive: r.is_active !== false,
      stops: stopsByRoute.get(String(r.id)) ?? [],
      studentCount: open.filter((a) => a.route_id === r.id && isAssignmentOpen(a, today)).length,
      today: toDay(dayByRoute.get(String(r.id))),
    })),
    assignments: open
      .map((a) => ({
        id: a.id,
        routeId: a.route_id,
        stopId: a.stop_id,
        studentId: a.student_id,
        studentName: names.get(a.student_id)?.name ?? "Aluno",
        studentNumber: names.get(a.student_id)?.number ?? null,
        validFrom: a.valid_from,
        validUntil: a.valid_until,
      }))
      .sort((x, y) => x.studentName.localeCompare(y.studentName, "pt")),
  };
}

// ---------------------------------------------------------------- escritas (portal)

async function loadRoute(db: TransportDb, schoolId: string, routeId: string) {
  const found = await db
    .from("siga_transport_routes")
    .select("id, name, is_active")
    .eq("school_id", schoolId)
    .eq("id", routeId)
    .maybeSingle();
  if (found.error) fail(found.error, "TRANSPORT_UNAVAILABLE");
  if (!found.data) throw new TransportError("ROUTE_NOT_FOUND");
  return found.data as { id: string; name: string; is_active: boolean };
}

export async function saveTransportVehicle(
  db: TransportDb,
  schoolId: string,
  userId: string,
  input: SaveVehicleInput,
) {
  await assertReady(db);
  const row = {
    plate: input.plate,
    label: input.label,
    seats: input.seats,
    driver_name: input.driverName ?? null,
    driver_phone: input.driverPhone ?? null,
    is_active: input.isActive,
    updated_by: userId,
  };
  const result = input.id
    ? await db
        .from("siga_transport_vehicles")
        .update(row)
        .eq("school_id", schoolId)
        .eq("id", input.id)
        .select("id")
        .maybeSingle()
    : await db
        .from("siga_transport_vehicles")
        .insert({ ...row, school_id: schoolId, created_by: userId })
        .select("id")
        .single();
  if (result.error?.code === "23505") throw new TransportError("PLATE_TAKEN");
  if (result.error) fail(result.error);
  if (!result.data) throw new TransportError("VEHICLE_NOT_FOUND");
  return { id: String(result.data.id) };
}

export async function saveTransportRoute(
  db: TransportDb,
  schoolId: string,
  userId: string,
  input: SaveRouteInput,
) {
  await assertReady(db);
  if (input.vehicleId) {
    const vehicle = await db
      .from("siga_transport_vehicles")
      .select("id")
      .eq("school_id", schoolId)
      .eq("id", input.vehicleId)
      .maybeSingle();
    if (vehicle.error) fail(vehicle.error, "TRANSPORT_UNAVAILABLE");
    if (!vehicle.data) throw new TransportError("VEHICLE_NOT_FOUND");
  }
  const row = {
    name: input.name,
    direction: input.direction,
    vehicle_id: input.vehicleId ?? null,
    is_active: input.isActive,
    updated_by: userId,
  };
  const result = input.id
    ? await db
        .from("siga_transport_routes")
        .update(row)
        .eq("school_id", schoolId)
        .eq("id", input.id)
        .select("id")
        .maybeSingle()
    : await db
        .from("siga_transport_routes")
        .insert({ ...row, school_id: schoolId, created_by: userId })
        .select("id")
        .single();
  if (result.error?.code === "23505") throw new TransportError("ROUTE_NAME_TAKEN");
  if (result.error) fail(result.error);
  if (!result.data) throw new TransportError("ROUTE_NOT_FOUND");
  return { id: String(result.data.id) };
}

/**
 * Grava a lista inteira de paragens pela ordem dada. As que saem da lista são
 * apagadas (recusado se tiverem alunos); as que ficam mudam de ordem em dois
 * passos (primeiro para 101+, depois para a posição final) para não bater na
 * unicidade (rota, ordem).
 */
export async function saveTransportStops(
  db: TransportDb,
  schoolId: string,
  userId: string,
  input: SaveStopsInput,
) {
  await assertReady(db);
  await loadRoute(db, schoolId, input.routeId);

  // Sem RPC não voltar ao algoritmo antigo: dezenas de escritas PostgREST
  // independentes podiam deixar a lista parcialmente alterada.
  if (!db.rpc) throw new TransportError("TRANSPORT_NOT_READY");
  const result = await db.rpc("siga_transport_save_stops_atomic", {
    p_school_id: schoolId,
    p_route_id: input.routeId,
    p_user_id: userId,
    p_stops: input.stops.map((s) => ({
      id: s.id ?? null,
      name: s.name,
      landmark: s.landmark ?? null,
      outbound_time: s.outboundTime ?? null,
      return_time: s.returnTime ?? null,
    })),
  });
  if (result.error?.code === "23503") {
    if (/Paragem não pertence à rota/.test(result.error.message ?? "")) {
      throw new TransportError("STOP_NOT_FOUND");
    }
    if (/siga_transport_stops|siga_transport_assignments/.test(result.error.message ?? "")) {
      throw new TransportError("STOP_IN_USE");
    }
  }
  if (result.error) fail(result.error);
  const data = result.data as { saved?: unknown; removed?: unknown } | null;
  if (!data || typeof data.saved !== "number" || typeof data.removed !== "number") {
    throw new TransportError("SAVE_FAILED");
  }
  return { saved: data.saved, removed: data.removed };
}

/**
 * Atribui alunos a uma paragem da rota. Quem já está nesta rota muda de
 * paragem (sem duplicar); os restantes entram a partir de `validFrom`.
 */
export async function assignTransportStudents(
  db: TransportDb,
  schoolId: string,
  userId: string,
  input: AssignStudentsInput,
  today: string,
) {
  await assertReady(db);
  const route = await loadRoute(db, schoolId, input.routeId);
  if (!route.is_active) throw new TransportError("ROUTE_INACTIVE");
  const stop = await db
    .from("siga_transport_stops")
    .select("id")
    .eq("school_id", schoolId)
    .eq("route_id", input.routeId)
    .eq("id", input.stopId)
    .maybeSingle();
  if (stop.error) fail(stop.error, "TRANSPORT_UNAVAILABLE");
  if (!stop.data) throw new TransportError("STOP_NOT_FOUND");

  const ids = [...new Set(input.studentIds)];
  const students = await db
    .from("students")
    .select("id")
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .in("id", ids);
  if (students.error) fail(students.error, "TRANSPORT_UNAVAILABLE");
  if ((students.data ?? []).length !== ids.length) throw new TransportError("STUDENT_NOT_FOUND");

  const open = await db
    .from("siga_transport_assignments")
    .select("id, student_id")
    .eq("school_id", schoolId)
    .eq("route_id", input.routeId)
    .is("valid_until", null)
    .in("student_id", ids);
  if (open.error) fail(open.error, "TRANSPORT_UNAVAILABLE");
  const already = (open.data ?? []) as { id: string; student_id: string }[];
  if (already.length) {
    const moved = await db
      .from("siga_transport_assignments")
      .update({ stop_id: input.stopId, updated_by: userId })
      .eq("school_id", schoolId)
      .in(
        "id",
        already.map((a) => a.id),
      );
    if (moved.error) fail(moved.error);
  }
  const placed = new Set(already.map((a) => a.student_id));
  const fresh = ids
    .filter((id) => !placed.has(id))
    .map((studentId) => ({
      school_id: schoolId,
      student_id: studentId,
      route_id: input.routeId,
      stop_id: input.stopId,
      valid_from: input.validFrom ?? today,
      created_by: userId,
      updated_by: userId,
    }));
  if (fresh.length) {
    const inserted = await db.from("siga_transport_assignments").insert(fresh);
    if (inserted.error) fail(inserted.error);
  }
  return { added: fresh.length, moved: already.length };
}

/** Termina a atribuição no dia dado; se ainda não tinha começado, apaga-a. */
export async function endTransportAssignment(
  db: TransportDb,
  schoolId: string,
  userId: string,
  input: EndAssignmentInput,
  today: string,
) {
  await assertReady(db);
  const found = await db
    .from("siga_transport_assignments")
    .select("id, valid_from")
    .eq("school_id", schoolId)
    .eq("id", input.assignmentId)
    .maybeSingle();
  if (found.error) fail(found.error, "TRANSPORT_UNAVAILABLE");
  if (!found.data) throw new TransportError("ASSIGNMENT_NOT_FOUND");
  const until = input.validUntil ?? today;
  const result =
    until < String(found.data.valid_from)
      ? await db
          .from("siga_transport_assignments")
          .delete()
          .eq("school_id", schoolId)
          .eq("id", input.assignmentId)
      : await db
          .from("siga_transport_assignments")
          .update({ valid_until: until, updated_by: userId })
          .eq("school_id", schoolId)
          .eq("id", input.assignmentId);
  if (result.error) fail(result.error);
  return { ended: true };
}

const DAY_TEXT = {
  delayed: (route: string, min: number, note: string | null) => ({
    title: `Transporte: ${route} com atraso`,
    body: `A rota ${route} está atrasada cerca de ${min} min hoje.${note ? ` ${note}` : ""}`,
  }),
  cancelled: (route: string, _min: number, note: string | null) => ({
    title: `Transporte: ${route} sem serviço hoje`,
    body: `Hoje não há transporte na rota ${route}.${note ? ` ${note}` : ""}`,
  }),
  normal: (route: string, _min: number, note: string | null) => ({
    title: `Transporte: ${route} normal`,
    body: `A rota ${route} volta ao horário normal hoje.${note ? ` ${note}` : ""}`,
  }),
};

/**
 * Estado da rota num dia. Avisa os alunos da rota (e os encarregados com
 * conta) quando o estado muda — gravar o mesmo estado outra vez não repete o
 * aviso, e «normal» só avisa se antes havia atraso ou falta de serviço.
 */
export async function setTransportDayStatus(
  db: TransportDb,
  schoolId: string,
  userId: string,
  input: SetDayStatusInput,
  today: string,
) {
  await assertReady(db);
  const route = await loadRoute(db, schoolId, input.routeId);
  const serviceDate = input.serviceDate ?? today;
  const delay = input.status === "delayed" ? input.delayMinutes : 0;

  // Os destinatários são resolvidos ANTES da transacção. Se esta leitura
  // falhar, não alterar o estado da rota silenciosamente sem os seus avisos.
  if (!db.rpc) throw new TransportError("TRANSPORT_NOT_READY");
  const userIds = await routeAudience(db, schoolId, input.routeId, serviceDate);
  const message = DAY_TEXT[input.status](route.name, delay, input.note ?? null);

  // Lock + mudança de estado + notificações in-app acontecem na mesma RPC.
  // Qualquer falha reverte tudo; um reenvio idêntico não cria novos avisos.
  const saved = await db.rpc("siga_transport_set_day_status_atomic", {
    p_school_id: schoolId,
    p_route_id: input.routeId,
    p_service_date: serviceDate,
    p_status: input.status,
    p_delay_minutes: delay,
    p_note: input.note ?? null,
    p_user_id: userId,
    p_recipient_user_ids: userIds,
    p_title: message.title,
    p_body: message.body,
  });
  if (saved.error?.code === "PGRST202") throw new TransportError("TRANSPORT_NOT_READY");
  if (saved.error) fail(saved.error);
  const result = saved.data as { changed?: unknown; notified?: unknown } | null;
  if (
    !result ||
    typeof result.changed !== "boolean" ||
    typeof result.notified !== "number" ||
    !Number.isInteger(result.notified) ||
    result.notified < 0
  ) {
    throw new TransportError("TRANSPORT_UNAVAILABLE");
  }
  return { notified: result.notified };
}

/** Contas dos alunos da rota nesse dia e dos seus encarregados. */
async function routeAudience(db: TransportDb, schoolId: string, routeId: string, day: string) {
  const rows = await db
    .from("siga_transport_assignments")
    .select("student_id, valid_from, valid_until")
    .eq("school_id", schoolId)
    .eq("route_id", routeId);
  if (rows.error) fail(rows.error, "TRANSPORT_UNAVAILABLE");
  const studentIds = [
    ...new Set(
      (
        (rows.data ?? []) as {
          student_id: string;
          valid_from: string;
          valid_until: string | null;
        }[]
      )
        .filter((a) => isAssignmentOpen(a, day))
        .map((a) => a.student_id),
    ),
  ];
  if (!studentIds.length) return [];
  // Para avisos só precisamos do person_id, não dos nomes completos.
  // Em rotas maiores, dividir também a consulta de encarregados: o filtro
  // IN sem limite pode exceder a URL da API ou o limite de linhas PostgREST.
  // Cada par de consultas corre em paralelo, com no máximo duas por lote.
  const studentPersonIds: string[] = [];
  const guardianRows: {
    guardian_person_id: string;
    valid_from: string;
    valid_until: string | null;
  }[] = [];
  for (let i = 0; i < studentIds.length; i += 200) {
    const chunk = studentIds.slice(i, i + 200);
    const [students, guardians] = await Promise.all([
      db.from("students").select("person_id").eq("school_id", schoolId).in("id", chunk),
      db
        .from("student_guardians")
        .select("guardian_person_id, valid_from, valid_until")
        .eq("school_id", schoolId)
        .in("student_id", chunk),
    ]);
    if (students.error) fail(students.error, "TRANSPORT_UNAVAILABLE");
    if (guardians.error) fail(guardians.error, "TRANSPORT_UNAVAILABLE");
    for (const row of (students.data ?? []) as { person_id: string }[]) {
      studentPersonIds.push(row.person_id);
    }
    guardianRows.push(
      ...((guardians.data ?? []) as {
        guardian_person_id: string;
        valid_from: string;
        valid_until: string | null;
      }[]),
    );
  }
  // Avisos só aos encarregados cujo vínculo já começou e não terminou.
  const eligibleGuardians = guardianRows.filter(
    (g) => g.valid_from <= day && (!g.valid_until || g.valid_until >= day),
  );
  const personIds = [
    ...new Set([...studentPersonIds, ...eligibleGuardians.map((g) => g.guardian_person_id)]),
  ];
  if (!personIds.length) return [];
  const users = new Set<string>();
  for (let i = 0; i < personIds.length; i += 200) {
    const people = await db
      .from("people")
      .select("user_id")
      .eq("school_id", schoolId)
      .in("id", personIds.slice(i, i + 200));
    if (people.error) fail(people.error, "TRANSPORT_UNAVAILABLE");
    for (const p of (people.data ?? []) as { user_id: string | null }[]) {
      if (p.user_id) users.add(p.user_id);
    }
  }
  return [...users];
}

// ---------------------------------------------------------------- leitura do aluno (Mobile V4)

export type StudentTransport = {
  routeId: string;
  routeName: string;
  direction: TransportRoute["direction"];
  stop: TransportStop;
  stopsCount: number;
  vehicle: Omit<TransportVehicle, "id" | "seats" | "isActive"> | null;
  today: TransportDay;
};

/** Só as rotas do próprio aluno, em vigor no dia; nada de outros alunos. */
export async function readStudentTransport(
  db: TransportDb,
  schoolId: string,
  studentId: string,
  today: string,
): Promise<{ available: boolean; routes: StudentTransport[] }> {
  const mine = await db
    .from("siga_transport_assignments")
    .select("route_id, stop_id, valid_from, valid_until")
    .eq("school_id", schoolId)
    .eq("student_id", studentId);
  if (mine.error) {
    if (isMissingTable(mine.error)) return { available: false, routes: [] };
    throw new TransportError("TRANSPORT_UNAVAILABLE");
  }
  const open = (
    (mine.data ?? []) as {
      route_id: string;
      stop_id: string;
      valid_from: string;
      valid_until: string | null;
    }[]
  ).filter((a) => isAssignmentOpen(a, today));
  if (!open.length) return { available: true, routes: [] };
  const routeIds = [...new Set(open.map((a) => a.route_id))];
  const [routes, stops, days] = await Promise.all([
    db
      .from("siga_transport_routes")
      .select("id, name, direction, vehicle_id, is_active")
      .eq("school_id", schoolId)
      .in("id", routeIds),
    db.from("siga_transport_stops").select("*").eq("school_id", schoolId).in("route_id", routeIds),
    db
      .from("siga_transport_day_status")
      .select("*")
      .eq("school_id", schoolId)
      .eq("service_date", today)
      .in("route_id", routeIds),
  ]);
  const failed = [routes, stops, days].find((r) => r.error);
  if (failed) throw new TransportError("TRANSPORT_UNAVAILABLE");
  const routeRows = ((routes.data ?? []) as Record<string, unknown>[]).filter(
    (r) => r.is_active !== false,
  );
  const vehicleIds = [
    ...new Set(routeRows.map((r) => r.vehicle_id).filter((v): v is string => !!v)),
  ];
  const vehicles = new Map<string, TransportVehicle>();
  if (vehicleIds.length) {
    const found = await db
      .from("siga_transport_vehicles")
      .select("*")
      .eq("school_id", schoolId)
      .in("id", vehicleIds);
    if (found.error) throw new TransportError("TRANSPORT_UNAVAILABLE");
    for (const v of (found.data ?? []) as Record<string, unknown>[]) {
      if (v.is_active !== false) vehicles.set(String(v.id), toVehicle(v));
    }
  }
  const stopRows = (stops.data ?? []) as Record<string, unknown>[];
  const dayRows = (days.data ?? []) as Record<string, unknown>[];
  const out: StudentTransport[] = [];
  for (const r of routeRows) {
    const assignment = open.find((a) => a.route_id === r.id);
    const stopRow = stopRows.find((s) => s.id === assignment?.stop_id);
    if (!assignment || !stopRow) continue;
    const vehicle = r.vehicle_id ? vehicles.get(String(r.vehicle_id)) : undefined;
    out.push({
      routeId: String(r.id),
      routeName: String(r.name),
      direction: r.direction as TransportRoute["direction"],
      stop: toStop(stopRow),
      stopsCount: stopRows.filter((s) => s.route_id === r.id).length,
      vehicle: vehicle
        ? {
            plate: vehicle.plate,
            label: vehicle.label,
            driverName: vehicle.driverName,
            driverPhone: vehicle.driverPhone,
          }
        : null,
      today: toDay(dayRows.find((d) => d.route_id === r.id)),
    });
  }
  return { available: true, routes: out.sort((a, b) => a.routeName.localeCompare(b.routeName)) };
}
