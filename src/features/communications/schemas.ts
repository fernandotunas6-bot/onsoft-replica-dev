import { z } from "zod";

export const announcementAudienceOptions = [
  "all_guardians",
  "guardians_with_debt",
  "students_secondary",
  "students_finalists",
  "teaching_staff",
] as const;

export const announcementChannelOptions = ["sms", "email", "portal"] as const;

export const announcementStatusOptions = ["draft", "scheduled", "sent"] as const;

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const listAnnouncementsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(40),
  status: z.enum(announcementStatusOptions).optional(),
});
export type ListAnnouncementsInput = z.infer<typeof listAnnouncementsInputSchema>;

export const createAnnouncementInputSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(2).max(4000),
    audience: z.enum(announcementAudienceOptions),
    channel: z.enum(announcementChannelOptions),
    status: z.enum(announcementStatusOptions).default("sent"),
    scheduledFor: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (value.status === "scheduled" && !value.scheduledFor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledFor"],
        message: "Indique a data de agendamento.",
      });
    }
  });
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementInputSchema>;

export const updateAnnouncementStatusInputSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(announcementStatusOptions),
    scheduledFor: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (value.status === "scheduled" && !value.scheduledFor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledFor"],
        message: "Indique a data de agendamento.",
      });
    }
  });
export type UpdateAnnouncementStatusInput = z.infer<typeof updateAnnouncementStatusInputSchema>;

export const updateAnnouncementInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(4000),
});
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementInputSchema>;

export const archiveAnnouncementInputSchema = z.object({
  id: z.string().uuid(),
});
export type ArchiveAnnouncementInput = z.infer<typeof archiveAnnouncementInputSchema>;
