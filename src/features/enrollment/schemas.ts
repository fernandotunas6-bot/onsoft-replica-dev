import { z } from "zod";
import { validateAngolaNif } from "@/lib/angola-identity";
import { personCoreFieldsObjectSchema } from "@/features/people/schemas";

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const enrollmentVisibleFieldOptions = [
  "birth_date",
  "sex",
  "phone_primary",
  "email",
  "province",
  "municipality",
  "commune",
  "address",
  "nif",
  "guardian_name",
  "guardian_phone",
  "guardian_relationship",
  "notes",
] as const;

export type EnrollmentVisibleField = (typeof enrollmentVisibleFieldOptions)[number];

export const enrollmentFormAppearanceSchema = z.object({
  title: z.string().trim().min(3).max(120),
  subtitle: optionalText,
  heroText: optionalText,
  accentColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use uma cor hexadecimal.")
    .default("#1d4ed8"),
  logoUrl: optionalText,
  isOpen: z.boolean().default(true),
  visibleFields: z
    .array(z.enum(enrollmentVisibleFieldOptions))
    .default([
      "birth_date",
      "sex",
      "phone_primary",
      "email",
      "province",
      "municipality",
      "address",
      "guardian_name",
      "guardian_phone",
      "guardian_relationship",
    ]),
});
export type EnrollmentFormAppearance = z.infer<typeof enrollmentFormAppearanceSchema>;

export const updateEnrollmentFormInputSchema = enrollmentFormAppearanceSchema.extend({
  id: z.string().uuid(),
});
export type UpdateEnrollmentFormInput = z.infer<typeof updateEnrollmentFormInputSchema>;

export const getPublicEnrollmentFormInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug inválido."),
});

export const submitPublicEnrollmentInputSchema = z.object({
  slug: getPublicEnrollmentFormInputSchema.shape.slug,
  person: personCoreFieldsObjectSchema
    .pick({
      full_name: true,
      birth_date: true,
      sex: true,
      phone_primary: true,
      email: true,
      province: true,
      municipality: true,
      commune: true,
      address: true,
      nif: true,
      notes: true,
    })
    .superRefine((value, ctx) => {
      if (!value.nif) return;
      const checked = validateAngolaNif(value.nif);
      if (!checked.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: checked.error ?? "NIF/BI inválido.",
          path: ["nif"],
        });
      }
    }),
  guardianName: optionalText,
  guardianPhone: optionalText,
  guardianRelationship: optionalText,
  /** Curso pretendido (Ensino Superior): só cursos activos da própria escola. */
  desiredProgramId: z.string().uuid().optional(),
});
export type SubmitPublicEnrollmentInput = z.infer<typeof submitPublicEnrollmentInputSchema>;

export const listEnrollmentApplicationsInputSchema = z.object({
  status: z.enum(["pending", "accepted", "rejected", "all"]).default("pending"),
  limit: z.number().int().min(1).max(200).default(50),
});

export const decideEnrollmentApplicationInputSchema = z.object({
  applicationId: z.string().uuid(),
  decision: z.enum(["accepted", "rejected"]),
  classGroupId: z.string().uuid().optional(),
  /** Colocar em turma fora do ciclo de matrículas: só a Administração, com motivo. */
  outsideCycleReason: z.string().trim().max(300).optional(),
});

export function candidacyProcessNumber(applicationId: string, createdAt?: string) {
  const day = (createdAt ?? new Date().toISOString()).slice(0, 10).replaceAll("-", "");
  return `CAND-${day}-${applicationId.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

/** Ciclos de matrícula da escola (Definições › Matrícula). */
export const saveEnrollmentCyclesInputSchema = z.object({
  cycles: z
    .array(
      z.object({
        label: z.string().trim().min(2, "Dê um nome ao ciclo.").max(80),
        opens_on: isoDay,
        closes_on: isoDay,
      }),
    )
    .max(12),
});
export type SaveEnrollmentCyclesInput = z.infer<typeof saveEnrollmentCyclesInputSchema>;
