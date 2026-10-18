import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { schoolTodayIso } from "@/lib/school-date";
import {
  assignStudentsSchema,
  endAssignmentSchema,
  saveRouteSchema,
  saveStopsSchema,
  saveVehicleSchema,
  setDayStatusSchema,
} from "./schemas";
import {
  assignTransportStudents,
  endTransportAssignment,
  readTransportOverview,
  saveTransportRoute,
  saveTransportStops,
  saveTransportVehicle,
  setTransportDayStatus,
  type TransportDb,
} from "./transport-core.server";

/**
 * Transporte escolar no portal. Administrador e Secretaria; outras contas só
 * com a permissão do módulo «Gestão» (Leitura para ver, Escrita para gravar).
 * As tabelas são só do servidor: tudo passa pelo cliente de serviço depois de
 * confirmada a escola da sessão.
 */
const ROLES = ["Administrador", "Secretaria"] as const;

async function transportDb(): Promise<TransportDb> {
  return (await loadSgaAdminClient()) as unknown as TransportDb;
}

async function writer(context: { supabase: SupabaseClient; userId: string }) {
  return requireSgaWriterForWrite("gestao", context.supabase, context.userId, [...ROLES]);
}

export const listTransport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      ...ROLES,
    ]);
    return readTransportOverview(await transportDb(), membership.schoolId, schoolTodayIso());
  });

export const saveVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveVehicleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await writer(context);
    return saveTransportVehicle(await transportDb(), membership.schoolId, context.userId, data);
  });

export const saveRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveRouteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await writer(context);
    return saveTransportRoute(await transportDb(), membership.schoolId, context.userId, data);
  });

export const saveStops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveStopsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await writer(context);
    return saveTransportStops(await transportDb(), membership.schoolId, context.userId, data);
  });

export const assignStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignStudentsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await writer(context);
    return assignTransportStudents(
      await transportDb(),
      membership.schoolId,
      context.userId,
      data,
      schoolTodayIso(),
    );
  });

export const endAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => endAssignmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await writer(context);
    return endTransportAssignment(
      await transportDb(),
      membership.schoolId,
      context.userId,
      data,
      schoolTodayIso(),
    );
  });

export const setDayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setDayStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await writer(context);
    return setTransportDayStatus(
      await transportDb(),
      membership.schoolId,
      context.userId,
      data,
      schoolTodayIso(),
    );
  });
