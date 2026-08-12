import { z } from "zod";
import { validateAngolaIban } from "@/lib/angola-banking";
import { validateSchoolNif } from "@/lib/angola-identity";
import { validateAngolaPhone } from "@/lib/angola-phone";

const schoolNifSchema = z
  .string()
  .trim()
  .min(6)
  .max(20)
  .refine((value) => validateSchoolNif(value).ok, {
    message: "NIF inválido para entidade (9–10 dígitos AGT ou formato legado).",
  });

const angolaPhoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(24)
  .refine((value) => validateAngolaPhone(value).ok, {
    message: "Telefone inválido. Use +244 9XX XXX XXX.",
  });

export const updateSchoolSettingsInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  nif: schoolNifSchema,
  directorName: z.string().trim().min(3).max(120),
  phone: angolaPhoneSchema,
  email: z.string().trim().email().max(255),
  address: z.string().trim().min(5).max(200),
  academicYear: z.string().trim().min(4).max(40),
  currency: z.string().trim().min(3).max(8),
  evaluationPeriods: z.number().int().min(1).max(6),
  passingGrade: z.number().min(0).max(20),
  preferences: z.record(z.string(), z.boolean()).default({}),
  logoUrl: z.union([z.string().trim().url().max(2048), z.literal("")]).optional(),
});
export type UpdateSchoolSettingsInput = z.infer<typeof updateSchoolSettingsInputSchema>;

export const updateSchoolBankingInputSchema = z.object({
  bankName: z.string().trim().min(2).max(120),
  accountHolder: z.string().trim().min(3).max(160),
  iban: z
    .string()
    .trim()
    .refine((value) => validateAngolaIban(value).ok, {
      message: "IBAN angolano inválido (AO + 23 dígitos).",
    }),
  swift: z.string().trim().max(11).optional().or(z.literal("")),
  multicaixaMerchant: z.string().trim().max(64).optional().or(z.literal("")),
});
export type UpdateSchoolBankingInput = z.infer<typeof updateSchoolBankingInputSchema>;

export const updateSchoolAgtInputSchema = z.object({
  softwareCertified: z.string().trim().max(120).optional().or(z.literal("")),
  invoiceSeries: z.string().trim().max(32).optional().or(z.literal("")),
  fiscalNotes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type UpdateSchoolAgtInput = z.infer<typeof updateSchoolAgtInputSchema>;

export const updateBillingSettingsInputSchema = z.object({
  dueDay: z.number().int().min(1).max(28),
  lateFeePercent: z.number().min(0).max(100),
  graceDays: z.number().int().min(0).max(60),
  siblingDiscountPercent: z.number().min(0).max(100),
});
export type UpdateBillingSettingsInput = z.infer<typeof updateBillingSettingsInputSchema>;

export const pedagogySettingsSchema = z.object({
  teachingLevels: z.array(z.enum(["pre_escolar", "primario", "i_ciclo", "ii_ciclo"])).default([]),
  courses: z.array(z.enum(["cfb", "cej", "letras", "tecnico"])).default([]),
  closedTerms: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).default([]),
});
export type PedagogySettings = z.infer<typeof pedagogySettingsSchema>;

export const setTermLockInputSchema = z.object({
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  closed: z.boolean(),
});
export type SetTermLockInput = z.infer<typeof setTermLockInputSchema>;
