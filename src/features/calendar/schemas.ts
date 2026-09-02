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

export const listCalendarEventsInputSchema = z.object({
  limit: z.number().int().min(1).max(80).default(50),
  fromDate: optionalText,
  academicYearId: z.string().uuid().optional(),
  includePast: z.boolean().optional(),
});
export type ListCalendarEventsInput = z.infer<typeof listCalendarEventsInputSchema>;

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
