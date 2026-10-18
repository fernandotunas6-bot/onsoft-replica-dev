import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (AAAA-MM-DD).");
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM).")
  .nullable()
  .optional();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const TRANSPORT_DIRECTIONS = ["outbound", "return", "both"] as const;
export const TRANSPORT_DAY_STATUSES = ["normal", "delayed", "cancelled"] as const;
export const TRANSPORT_MAX_STOPS = 60;

export const saveVehicleSchema = z
  .object({
    id: uuid.optional(),
    plate: text(2, 20).transform((v) => v.toUpperCase()),
    label: text(1, 80),
    seats: z.number().int().min(1).max(120),
    driverName: optionalText(120),
    driverPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{6,20}$/, "Telefone inválido.")
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    isActive: z.boolean().default(true),
  })
  .strict();

export const saveRouteSchema = z
  .object({
    id: uuid.optional(),
    name: text(1, 80),
    direction: z.enum(TRANSPORT_DIRECTIONS),
    vehicleId: uuid.nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export const transportStopSchema = z
  .object({
    id: uuid.optional(),
    name: text(1, 120),
    landmark: optionalText(200),
    outboundTime: clock,
    returnTime: clock,
  })
  .strict();

/** A lista inteira de paragens da rota, pela ordem do percurso. */
export const saveStopsSchema = z
  .object({
    routeId: uuid,
    stops: z.array(transportStopSchema).max(TRANSPORT_MAX_STOPS),
  })
  .strict();

export const assignStudentsSchema = z
  .object({
    routeId: uuid,
    stopId: uuid,
    studentIds: z.array(uuid).min(1).max(200),
    validFrom: isoDate.optional(),
  })
  .strict();

export const endAssignmentSchema = z
  .object({ assignmentId: uuid, validUntil: isoDate.optional() })
  .strict();

export const setDayStatusSchema = z
  .object({
    routeId: uuid,
    serviceDate: isoDate.optional(),
    status: z.enum(TRANSPORT_DAY_STATUSES),
    delayMinutes: z.number().int().min(0).max(240).default(0),
    note: optionalText(300),
  })
  .strict()
  .refine((v) => v.status !== "delayed" || v.delayMinutes > 0, {
    message: "Indique os minutos de atraso.",
    path: ["delayMinutes"],
  });

export type SaveVehicleInput = z.infer<typeof saveVehicleSchema>;
export type SaveRouteInput = z.infer<typeof saveRouteSchema>;
export type SaveStopsInput = z.infer<typeof saveStopsSchema>;
export type AssignStudentsInput = z.infer<typeof assignStudentsSchema>;
export type EndAssignmentInput = z.infer<typeof endAssignmentSchema>;
export type SetDayStatusInput = z.infer<typeof setDayStatusSchema>;
