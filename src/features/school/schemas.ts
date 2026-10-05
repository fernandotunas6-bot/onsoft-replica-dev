import { z } from "zod";
import { isCourseId, isTeachingLevelId } from "@/lib/angola-academic";
import { isSchoolTypeId } from "@/lib/school-config";
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
  /** Ignorado: o ano lectivo vem de academic_years (calendário). Mantido para clientes antigos. */
  academicYear: z.string().trim().max(40).optional(),
  currency: z.enum(["AOA", "USD", "EUR"]),
  // Alinhado com angola-academic (MIN/MAX_EVALUATION_PERIODS) e com o CHECK da
  // tabela `schools`. Antes aceitava 1–6, valores que o resto do sistema não sabe representar.
  evaluationPeriods: z.number().int().min(2).max(3),
  passingGrade: z.number().min(0).max(20),
  preferences: z.record(z.string(), z.boolean()).default({}),
  logoUrl: z.union([z.string().trim().url().max(2048), z.literal("")]).optional(),
  motto: z.string().trim().max(160).optional(),
  // Identidade institucional. `schoolType` é validado contra a taxonomia única em
  // school-config; um valor desconhecido vira `undefined` em vez de rejeitar o
  // formulário inteiro, para o mesmo motivo dos níveis de ensino.
  schoolType: z
    .unknown()
    .optional()
    .transform((value) => (isSchoolTypeId(value) ? value : undefined)),
  philosophy: z.string().trim().max(600).optional(),
  // Localização. Todas opcionais; as coordenadas vêm em par ou nenhuma.
  province: z.string().trim().max(80).optional(),
  municipality: z.string().trim().max(80).optional(),
  commune: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().max(120).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
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
  lateFeeScope: z.enum(["all", "electronic"]),
  siblingDiscountPercent: z.number().min(0).max(100),
});
export type UpdateBillingSettingsInput = z.infer<typeof updateBillingSettingsInputSchema>;

/** Perfil de notas do Ensino Superior — valor por omissão da escola; cada curso pode sobrepor-se
 * (ver migração 20260811150000_program_grading_profile.sql, coluna programs.grading_profile). */
export const gradingProfileSchema = z.object({
  scale: z.enum(["20_ects", "gpa4"]),
  components: z.enum(["frequencia_exame", "so_exame"]),
});
export type GradingProfileInput = z.infer<typeof gradingProfileSchema>;

/**
 * Níveis e cursos são lidos com tolerância a valores desconhecidos: descartam-se
 * os que já não existem em vez de rejeitar o objecto inteiro. Sem isto, um único
 * valor legado fazia o `safeParse` falhar e o fallback em `school/server.ts`
 * apagava toda a configuração pedagógica da escola — trimestres fechados incluídos.
 *
 * A lista válida vem de `angola-academic`, que é a mesma que o painel apresenta:
 * antes o schema aceitava sete níveis, mas só cinco eram seleccionáveis e
 * reconhecidos por `gradeMatchesTeachingLevels`.
 */
export const pedagogySettingsSchema = z.object({
  teachingLevels: z
    .array(z.unknown())
    .default([])
    .transform((values) => values.filter(isTeachingLevelId)),
  courses: z
    .array(z.unknown())
    .default([])
    .transform((values) => values.filter(isCourseId)),
  closedTerms: z
    .array(z.unknown())
    .default([])
    .transform((values) =>
      values.filter((value): value is 1 | 2 | 3 => value === 1 || value === 2 || value === 3),
    ),
  gradingProfile: gradingProfileSchema.nullable().default(null),
});
export type PedagogySettings = z.infer<typeof pedagogySettingsSchema>;

export const setTermLockInputSchema = z.object({
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  closed: z.boolean(),
});
export type SetTermLockInput = z.infer<typeof setTermLockInputSchema>;
