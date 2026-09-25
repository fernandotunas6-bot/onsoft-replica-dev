import { z } from "zod";
import { applicationRoles } from "@/features/auth/access-policy";
import { accessRequestProfiles, accessRequestStatuses } from "./institutional-link";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const searchSchoolsForAccessInputSchema = z.object({
  query: z.string().trim().min(3, "Escreva pelo menos 3 caracteres.").max(80),
});
export type SearchSchoolsForAccessInput = z.infer<typeof searchSchoolsForAccessInputSchema>;

export const submitAccessRequestInputSchema = z
  .object({
    schoolId: z.string().uuid(),
    profile: z.enum(accessRequestProfiles),
    fullName: z.string().trim().min(3, "Indique o nome completo.").max(160),
    nationalId: optionalText(40),
    institutionalNumber: optionalText(60),
    contactPhone: optionalText(30),
    message: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    // O aluno identifica-se pelo número institucional; o encarregado pelo do
    // educando. Sem ele, a secretaria não tem como localizar o cadastro.
    if (
      (value.profile === "aluno" || value.profile === "encarregado") &&
      !value.institutionalNumber
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["institutionalNumber"],
        message:
          value.profile === "aluno"
            ? "Indique o número de aluno."
            : "Indique o número de aluno do educando.",
      });
    }
  });
export type SubmitAccessRequestInput = z.infer<typeof submitAccessRequestInputSchema>;

export const requesterAccessRequestActionInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), requestId: z.string().uuid() }),
  z.object({
    action: z.literal("reply"),
    requestId: z.string().uuid(),
    reply: z.string().trim().min(2, "Escreva a resposta à secretaria.").max(1000),
  }),
]);
export type RequesterAccessRequestActionInput = z.infer<
  typeof requesterAccessRequestActionInputSchema
>;

export const listSchoolAccessRequestsInputSchema = z.object({
  status: z.enum([...accessRequestStatuses, "open", "all"]).default("open"),
});
export type ListSchoolAccessRequestsInput = z.infer<typeof listSchoolAccessRequestsInputSchema>;

export const reviewAccessRequestInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_review"), requestId: z.string().uuid() }),
  z.object({
    action: z.literal("request_info"),
    requestId: z.string().uuid(),
    note: z.string().trim().min(3, "Indique que informação falta.").max(1000),
  }),
  z.object({
    action: z.literal("reject"),
    requestId: z.string().uuid(),
    note: z.string().trim().min(3, "Indique o motivo da rejeição.").max(1000),
  }),
  z.object({
    action: z.literal("approve"),
    requestId: z.string().uuid(),
    role: z.enum(applicationRoles),
    /** Associar a conta ao cadastro encontrado (people.user_id). Explícito, nunca implícito. */
    linkMatchedRecord: z.boolean().default(false),
    note: optionalText(1000),
  }),
]);
export type ReviewAccessRequestInput = z.infer<typeof reviewAccessRequestInputSchema>;
