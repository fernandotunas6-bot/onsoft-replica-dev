import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.fn(async (_db: unknown, _school: string, rows: unknown[]) => rows.length);
vi.mock("@/features/academic/lesson-delivery", () => ({
  insertInAppNotifications: (...args: [unknown, string, unknown[]]) => notify(...args),
}));

import {
  assignTransportStudents,
  isAssignmentOpen,
  readStudentTransport,
  readTransportOverview,
  saveTransportRoute,
  saveTransportStops,
  saveTransportVehicle,
  setTransportDayStatus,
  type TransportDb,
} from "@/features/transport/transport-core.server";
import { saveStopsSchema, setDayStatusSchema } from "@/features/transport/schemas";

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const SCHOOL = id(1);
const USER = id(2);
const ROUTE = id(3);
const STOP_A = id(4);
const STOP_B = id(5);
const STUDENT = id(6);
const OTHER = id(7);
const VEHICLE = id(8);
const TODAY = "2026-10-18";

type Op = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
let queries: { table: string; ops: Op[] }[];

function database(answer: (table: string, ops: Op[]) => Answer): TransportDb {
  return {
    from(table: string) {
      const ops: Op[] = [];
      queries.push({ table, ops });
      const chain: Record<string, unknown> = {};
      for (const name of [
        "select",
        "eq",
        "in",
        "is",
        "limit",
        "order",
        "insert",
        "update",
        "upsert",
        "delete",
        "maybeSingle",
        "single",
      ]) {
        chain[name] = (...args: unknown[]) => {
          ops.push([name, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ error: null, ...answer(table, ops) });
      return chain;
    },
  };
}
const has = (ops: Op[], name: string) => ops.some((o) => o[0] === name);
const writes = (table?: string) =>
  queries.filter(
    (q) =>
      (!table || q.table === table) &&
      q.ops.some((o) => ["insert", "update", "upsert", "delete"].includes(o[0])),
  );
const missing = { error: { code: "42P01", message: "relation does not exist" } };

const route = { id: ROUTE, name: "Rota Kilamba", is_active: true };
const stopRow = (sid: string, sequence: number) => ({
  id: sid,
  route_id: ROUTE,
  sequence,
  name: `Paragem ${sequence}`,
  landmark: null,
  outbound_time: "06:40:00",
  return_time: "17:10:00",
});

beforeEach(() => {
  queries = [];
  notify.mockClear();
});

describe("sem a migração aplicada", () => {
  it("a leitura do portal diz «não disponível» e a do aluno também", async () => {
    const db = database(() => missing);
    expect(await readTransportOverview(db, SCHOOL, TODAY)).toEqual({ available: false });
    expect(await readStudentTransport(db, SCHOOL, STUDENT, TODAY)).toEqual({
      available: false,
      routes: [],
    });
  });
  it("as escritas recusam antes de gravar", async () => {
    const db = database(() => missing);
    await expect(
      saveTransportVehicle(db, SCHOOL, USER, {
        plate: "LD-01-23-AB",
        label: "Autocarro 1",
        seats: 30,
        isActive: true,
        driverName: null,
        driverPhone: null,
      }),
    ).rejects.toMatchObject({ code: "TRANSPORT_NOT_READY" });
    expect(writes()).toEqual([]);
  });
});

describe("portal: leitura", () => {
  it("agrupa paragens, conta só os alunos em vigor e traz o estado de hoje", async () => {
    const db = database((table) => {
      if (table === "siga_transport_vehicles") return { data: [] };
      if (table === "siga_transport_routes")
        return { data: [{ ...route, direction: "both", vehicle_id: null }] };
      if (table === "siga_transport_stops")
        return { data: [stopRow(STOP_A, 1), stopRow(STOP_B, 2)] };
      if (table === "siga_transport_assignments")
        return {
          data: [
            {
              id: id(20),
              route_id: ROUTE,
              stop_id: STOP_A,
              student_id: STUDENT,
              valid_from: "2026-09-01",
              valid_until: null,
            },
            // terminou ontem: fora
            {
              id: id(21),
              route_id: ROUTE,
              stop_id: STOP_A,
              student_id: OTHER,
              valid_from: "2026-09-01",
              valid_until: "2026-10-17",
            },
          ],
        };
      if (table === "siga_transport_day_status")
        return { data: [{ route_id: ROUTE, status: "delayed", delay_minutes: 15, note: null }] };
      if (table === "students")
        return { data: [{ id: STUDENT, person_id: id(30), student_number: "12026" }] };
      if (table === "people") return { data: [{ id: id(30), full_name: "Ana Souza" }] };
      throw new Error(table);
    });
    const out = await readTransportOverview(db, SCHOOL, TODAY);
    if (!out.available) throw new Error("devia estar disponível");
    expect(out.routes[0]).toMatchObject({
      studentCount: 1,
      today: { status: "delayed", delayMinutes: 15 },
    });
    expect(out.routes[0].stops.map((s) => [s.sequence, s.outboundTime])).toEqual([
      [1, "06:40"],
      [2, "06:40"],
    ]);
    expect(out.assignments).toEqual([
      expect.objectContaining({ studentId: STUDENT, studentName: "Ana Souza" }),
    ]);
    for (const q of queries) expect(q.ops).toContainEqual(["eq", "school_id", SCHOOL]);
  });
});

describe("portal: viaturas e rotas", () => {
  it("matrícula repetida dá PLATE_TAKEN; editar filtra pela escola", async () => {
    const db = database((table, ops) =>
      table === "siga_transport_vehicles" && has(ops, "update")
        ? { error: { code: "23505", message: "duplicate" } }
        : { data: [] },
    );
    await expect(
      saveTransportVehicle(db, SCHOOL, USER, {
        id: VEHICLE,
        plate: "LD-01",
        label: "A",
        seats: 10,
        isActive: true,
        driverName: null,
        driverPhone: null,
      }),
    ).rejects.toMatchObject({ code: "PLATE_TAKEN" });
    expect(writes("siga_transport_vehicles")[0].ops).toContainEqual(["eq", "school_id", SCHOOL]);
  });
  it("rota com viatura de outra escola é recusada", async () => {
    const db = database((table, ops) =>
      table === "siga_transport_vehicles" && has(ops, "maybeSingle")
        ? { data: null }
        : { data: [] },
    );
    await expect(
      saveTransportRoute(db, SCHOOL, USER, {
        name: "Rota 1",
        direction: "both",
        vehicleId: VEHICLE,
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "VEHICLE_NOT_FOUND" });
    expect(writes()).toEqual([]);
  });
});

describe("portal: paragens", () => {
  const routeDb = () => {
    const db = database((table, ops) => {
      if (table === "siga_transport_routes") {
        return has(ops, "maybeSingle") ? { data: route } : { data: [] };
      }
      throw new Error(table);
    });
    db.rpc = vi.fn(async (_name, args) => ({
      data: { saved: (args.p_stops as unknown[]).length, removed: 0 },
      error: null,
    }));
    return db;
  };

  it("reordena e inclui novas paragens numa só RPC, sem escritas parciais", async () => {
    const input = saveStopsSchema.parse({
      routeId: ROUTE,
      stops: [
        { id: STOP_B, name: "B", outboundTime: "06:30" },
        { id: STOP_A, name: "A" },
        { name: "Nova", landmark: "  " },
      ],
    });
    const db = routeDb();
    const out = await saveTransportStops(db, SCHOOL, USER, input);
    expect(out).toEqual({ saved: 3, removed: 0 });
    expect(db.rpc).toHaveBeenCalledWith("siga_transport_save_stops_atomic", {
      p_school_id: SCHOOL,
      p_route_id: ROUTE,
      p_user_id: USER,
      p_stops: [
        { id: STOP_B, name: "B", landmark: null, outbound_time: "06:30", return_time: null },
        { id: STOP_A, name: "A", landmark: null, outbound_time: null, return_time: null },
        { id: null, name: "Nova", landmark: null, outbound_time: null, return_time: null },
      ],
    });
    expect(writes("siga_transport_stops")).toEqual([]);
  });

  it("sem RPC transaccional recusa escrita, sem voltar ao algoritmo antigo", async () => {
    const db = routeDb();
    delete db.rpc;
    await expect(
      saveTransportStops(
        db,
        SCHOOL,
        USER,
        saveStopsSchema.parse({ routeId: ROUTE, stops: [{ id: STOP_A, name: "A" }] }),
      ),
    ).rejects.toMatchObject({ code: "TRANSPORT_NOT_READY" });
    expect(writes("siga_transport_stops")).toEqual([]);
  });

  it("falha por paragem em uso sem tentar outras gravações", async () => {
    const db = routeDb();
    db.rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "23503",
        message: 'update or delete on "siga_transport_stops" violates fk on siga_transport_assignments',
      },
    }));
    await expect(
      saveTransportStops(
        db,
        SCHOOL,
        USER,
        saveStopsSchema.parse({ routeId: ROUTE, stops: [{ id: STOP_A, name: "A" }] }),
      ),
    ).rejects.toMatchObject({ code: "STOP_IN_USE" });
    expect(writes("siga_transport_stops")).toEqual([]);
  });

  it("paragem de outra rota falha fechada dentro da transacção", async () => {
    const db = routeDb();
    db.rpc = vi.fn(async () => ({
      data: null,
      error: { code: "23503", message: "Paragem não pertence à rota" },
    }));
    await expect(
      saveTransportStops(
        db,
        SCHOOL,
        USER,
        saveStopsSchema.parse({ routeId: ROUTE, stops: [{ id: id(99), name: "X" }] }),
      ),
    ).rejects.toMatchObject({ code: "STOP_NOT_FOUND" });
    expect(writes("siga_transport_stops")).toEqual([]);
  });
});

describe("portal: alunos da rota", () => {
  const assignDb = (students: unknown[], open: unknown[]) =>
    database((table, ops) => {
      if (table === "siga_transport_routes")
        return has(ops, "maybeSingle") ? { data: route } : { data: [] };
      if (table === "siga_transport_stops") return { data: { id: STOP_A } };
      if (table === "students") return { data: students };
      if (table === "siga_transport_assignments") return has(ops, "select") ? { data: open } : {};
      throw new Error(table);
    });

  it("aluno de outra escola: recusa tudo", async () => {
    await expect(
      assignTransportStudents(
        assignDb([{ id: STUDENT }], []),
        SCHOOL,
        USER,
        {
          routeId: ROUTE,
          stopId: STOP_A,
          studentIds: [STUDENT, OTHER],
        },
        TODAY,
      ),
    ).rejects.toMatchObject({ code: "STUDENT_NOT_FOUND" });
    expect(writes("siga_transport_assignments")).toEqual([]);
  });

  it("quem já está na rota muda de paragem; os outros entram hoje", async () => {
    const out = await assignTransportStudents(
      assignDb([{ id: STUDENT }, { id: OTHER }], [{ id: id(20), student_id: STUDENT }]),
      SCHOOL,
      USER,
      { routeId: ROUTE, stopId: STOP_A, studentIds: [STUDENT, OTHER] },
      TODAY,
    );
    expect(out).toEqual({ added: 1, moved: 1 });
    const insert = writes("siga_transport_assignments")
      .flatMap((q) => q.ops)
      .find((o) => o[0] === "insert")?.[1];
    expect(insert).toEqual([
      expect.objectContaining({ student_id: OTHER, valid_from: TODAY, school_id: SCHOOL }),
    ]);
  });
});

describe("portal: estado do dia", () => {
  const dayDb = (
    previous: unknown,
    guardians: { guardian_person_id: string; valid_from: string; valid_until: string | null }[] = [
      { guardian_person_id: id(31), valid_from: "2026-09-01", valid_until: null },
    ],
  ) =>
    database((table, ops) => {
      if (table === "siga_transport_routes") return { data: route };
      if (table === "siga_transport_day_status")
        return has(ops, "maybeSingle") ? { data: previous } : {};
      if (table === "siga_transport_assignments")
        return {
          data: [
            { student_id: STUDENT, valid_from: "2026-09-01", valid_until: null },
            { student_id: OTHER, valid_from: "2026-11-01", valid_until: null },
          ],
        };
      if (table === "students")
        return { data: [{ id: STUDENT, person_id: id(30), student_number: null }] };
      if (table === "student_guardians") return { data: guardians };
      if (table === "people") {
        if (has(ops, "select") && String(ops[0][1]).includes("user_id")) {
          const requested = (ops.find((op) => op[0] === "in" && op[1] === "id")?.[2] ??
            []) as string[];
          const linkedUsers = new Map([
            [id(30), id(40)],
            [id(31), id(41)],
            [id(32), id(42)],
            [id(33), id(43)],
          ]);
          return {
            data: requested
              .filter((personId) => linkedUsers.has(personId))
              .map((personId) => ({ user_id: linkedUsers.get(personId) })),
          };
        }
        return { data: [{ id: id(30), full_name: "Ana" }] };
      }
      throw new Error(table);
    });

  it("atraso novo avisa o aluno e o encarregado com conta", async () => {
    const input = setDayStatusSchema.parse({ routeId: ROUTE, status: "delayed", delayMinutes: 20 });
    const out = await setTransportDayStatus(dayDb(null), SCHOOL, USER, input, TODAY);
    expect(out.notified).toBe(2);
    const rows = notify.mock.calls[0][2] as { userId: string; title: string; eventType: string }[];
    expect(rows.map((r) => r.userId).sort()).toEqual([id(40), id(41)]);
    expect(rows[0]).toMatchObject({
      eventType: "transport.day_status",
      title: "Transporte: Rota Kilamba com atraso",
    });
  });

  it("não avisa encarregados de vínculos futuros ou já terminados", async () => {
    const guardians = [
      { guardian_person_id: id(31), valid_from: TODAY, valid_until: TODAY },
      { guardian_person_id: id(32), valid_from: "2026-11-01", valid_until: null },
      { guardian_person_id: id(33), valid_from: "2026-09-01", valid_until: "2026-10-17" },
    ];
    const input = setDayStatusSchema.parse({ routeId: ROUTE, status: "delayed", delayMinutes: 20 });
    const out = await setTransportDayStatus(dayDb(null, guardians), SCHOOL, USER, input, TODAY);
    expect(out.notified).toBe(2);
    const rows = notify.mock.calls[0][2] as { userId: string }[];
    expect(rows.map((r) => r.userId).sort()).toEqual([id(40), id(41)]);
    const guardianQuery = queries.find((q) => q.table === "student_guardians");
    expect(guardianQuery?.ops).toContainEqual([
      "select",
      "guardian_person_id, valid_from, valid_until",
    ]);
    expect(guardianQuery?.ops).toContainEqual(["eq", "school_id", SCHOOL]);
  });

  it("gravar o mesmo estado outra vez não repete o aviso", async () => {
    const input = setDayStatusSchema.parse({ routeId: ROUTE, status: "delayed", delayMinutes: 20 });
    const out = await setTransportDayStatus(
      dayDb({ status: "delayed", delay_minutes: 20 }),
      SCHOOL,
      USER,
      input,
      TODAY,
    );
    expect(out.notified).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("atraso sem minutos é recusado pelo esquema", () => {
    expect(setDayStatusSchema.safeParse({ routeId: ROUTE, status: "delayed" }).success).toBe(false);
  });
});

describe("aluno (Mobile V4)", () => {
  it("só as suas rotas em vigor, sem lugares nem rotas inactivas", async () => {
    const ROUTE2 = id(50);
    const db = database((table, ops) => {
      if (table === "siga_transport_assignments")
        return {
          data: [
            { route_id: ROUTE, stop_id: STOP_B, valid_from: "2026-09-01", valid_until: null },
            { route_id: ROUTE2, stop_id: STOP_A, valid_from: "2026-09-01", valid_until: null },
            { route_id: id(51), stop_id: STOP_A, valid_from: "2026-11-01", valid_until: null },
          ],
        };
      if (table === "siga_transport_routes")
        return {
          data: [
            {
              id: ROUTE,
              name: "Rota Kilamba",
              direction: "outbound",
              vehicle_id: VEHICLE,
              is_active: true,
            },
            {
              id: ROUTE2,
              name: "Rota Velha",
              direction: "both",
              vehicle_id: null,
              is_active: false,
            },
          ],
        };
      if (table === "siga_transport_stops")
        return { data: [stopRow(STOP_A, 1), stopRow(STOP_B, 2)] };
      if (table === "siga_transport_day_status")
        return {
          data: [{ route_id: ROUTE, status: "cancelled", delay_minutes: 0, note: "Avaria" }],
        };
      if (table === "siga_transport_vehicles")
        return {
          data: [
            {
              id: VEHICLE,
              plate: "LD-01",
              label: "Autocarro 1",
              seats: 30,
              driver_name: "Sr. João",
              driver_phone: "923000000",
              is_active: true,
            },
          ],
        };
      throw new Error(`${table} ${JSON.stringify(ops)}`);
    });
    const out = await readStudentTransport(db, SCHOOL, STUDENT, TODAY);
    expect(out.routes).toHaveLength(1);
    expect(out.routes[0]).toMatchObject({
      routeName: "Rota Kilamba",
      stop: { id: STOP_B, sequence: 2, outboundTime: "06:40" },
      stopsCount: 2,
      vehicle: { plate: "LD-01", driverName: "Sr. João" },
      today: { status: "cancelled", note: "Avaria" },
    });
    expect(out.routes[0].vehicle).not.toHaveProperty("seats");
    const own = queries.find((q) => q.table === "siga_transport_assignments")!;
    expect(own.ops).toContainEqual(["eq", "student_id", STUDENT]);
  });

  it("atribuição em vigor: começou e não terminou", () => {
    expect(isAssignmentOpen({ valid_from: TODAY, valid_until: null }, TODAY)).toBe(true);
    expect(isAssignmentOpen({ valid_from: TODAY, valid_until: TODAY }, TODAY)).toBe(true);
    expect(isAssignmentOpen({ valid_from: "2026-10-19", valid_until: null }, TODAY)).toBe(false);
    expect(isAssignmentOpen({ valid_from: "2026-01-01", valid_until: "2026-10-17" }, TODAY)).toBe(
      false,
    );
  });
});
