import { z } from "zod";

export const calendarCategoryOptions = [
  "academic",
  "meeting",
  "deadline",
  "holiday",
  "general",
] as const;

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const createCalendarEventInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: optionalText,
  eventDate: z.string().trim().min(10).max(10),
  endsOn: z.string().trim().min(10).max(10),
  academicYearId: z.string().uuid().optional(),
  sequence: z.number().int().min(1).max(20).optional(),
  category: z.enum(calendarCategoryOptions).default("academic"),
});
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventInputSchema>;

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");

export const createAcademicYearInputSchema = z
  .object({
    name: z.string().trim().min(4, "Indique o nome do ano lectivo.").max(40),
    startsOn: isoDate,
    endsOn: isoDate,
  })
  .refine((value) => value.endsOn > value.startsOn, {
    message: "A data de fim tem de ser posterior ao início.",
    path: ["endsOn"],
  });
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearInputSchema>;

export const listCalendarEventsInputSchema = z.object({
  limit: z.number().int().min(1).max(80).default(50),
  fromDate: optionalText,
  academicYearId: z.string().uuid().optional(),
  includePast: z.boolean().optional(),
});
export type ListCalendarEventsInput = z.infer<typeof listCalendarEventsInputSchema>;

export const listDayAgendaLessonsInputSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().min(1).max(40).default(24),
});
export type ListDayAgendaLessonsInput = z.infer<typeof listDayAgendaLessonsInputSchema>;

export const updateCalendarEventInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  eventDate: z.string().trim().min(10).max(10),
  endsOn: z.string().trim().min(10).max(10),
});
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventInputSchema>;

export const deleteCalendarEventInputSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteCalendarEventInput = z.infer<typeof deleteCalendarEventInputSchema>;

export const setActiveAcademicYearInputSchema = z.object({
  yearId: z.string().uuid(),
});
