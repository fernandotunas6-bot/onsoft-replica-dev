import { z } from "zod";
import { parseCivilDate } from "@/features/academic/schedule/utils/academicTime";

export const civilDateSchema = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Data civil inválida (AAAA-MM-DD).");

export const agendaRangeSchema = z
  .object({
    start: civilDateSchema,
    end: civilDateSchema,
    academicYearId: z.string().guid().optional(),
    classGroupId: z.string().guid().optional(),
    teacherId: z.string().guid().optional(),
    studentId: z.string().guid().optional(),
  })
  .refine((v) => {
    const days = (Date.parse(v.end) - Date.parse(v.start)) / 86_400_000;
    return days > 0 && days <= 93;
  }, "Seleccione entre 1 e 93 dias; o fim é exclusivo.");
export type AgendaRange = z.infer<typeof agendaRangeSchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const saveAgendaEventSchema = z
  .object({
    id: z.string().guid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    academicYearId: z.string().guid(),
    classGroupId: z.string().guid().nullable().default(null),
    teacherId: z.string().guid().nullable().default(null),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(4000).default(""),
    category: z.enum(["event", "meeting", "deadline", "holiday", "closure"]),
    startsOn: civilDateSchema,
    endsOn: civilDateSchema,
    startsAt: time.nullable().default(null),
    endsAt: time.nullable().default(null),
    audience: z.enum(["all", "staff"]).default("all"),
    blocksTeaching: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const invalid =
      v.endsOn < v.startsOn ||
      (v.startsAt === null) !== (v.endsAt === null) ||
      (v.startsAt !== null && (v.startsOn !== v.endsOn || v.endsAt! <= v.startsAt)) ||
      (v.blocksTeaching && (v.startsAt !== null || !["closure", "holiday"].includes(v.category))) ||
      !!v.id !== !!v.expectedVersion;
    if (invalid)
      ctx.addIssue({
        code: "custom",
        message: "Intervalo, interrupção lectiva ou versão inválida.",
      });
  });

export const cancelAgendaEventSchema = z.object({
  id: z.string().guid(),
  expectedVersion: z.number().int().positive(),
});
