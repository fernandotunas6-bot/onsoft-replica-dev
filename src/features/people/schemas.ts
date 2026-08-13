import { z } from "zod";
import { validateAngolaBi, validateAngolaNif } from "@/lib/angola-identity";
import { normalizeAngolaPhone, validateAngolaPhone } from "@/lib/angola-phone";

export const personSexOptions = ["M", "F", "outro"] as const;
export const personDocumentTypeOptions = ["bi", "passaporte", "cedula", "outro"] as const;
export const personRoleOptions = [
  "aluno",
  "encarregado",
  "professor",
  "funcionario",
  "diretor",
  "coordenador",
  "utilizador",
  "fornecedor",
  "contacto_institucional",
] as const;
export const personRelationshipTypeOptions = [
  "pai",
  "mae",
  "encarregado",
  "tutor",
  "conjuge",
  "irmao",
  "contacto_emergencia",
  "responsavel_financeiro",
  "responsavel_autorizado_buscar",
] as const;

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const personDocumentInputSchema = z
  .object({
    document_type: z.enum(personDocumentTypeOptions),
    document_number: z.string().trim().min(1, "Número do documento é obrigatório"),
    issued_at: optionalText,
    expires_at: optionalText,
    file_id: z.string().uuid().optional(),
    file_name: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.document_type !== "bi") return;
    const checked = validateAngolaBi(value.document_number);
    if (!checked.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: checked.error ?? "BI inválido.",
        path: ["document_number"],
      });
    }
  });

export const personRelationshipInputSchema = z.object({
  related_person_id: z.string().uuid(),
  relationship_type: z.enum(personRelationshipTypeOptions),
  priority: z.number().int().optional(),
  authorized: z.boolean().default(true),
  valid_from: optionalText,
  valid_until: optionalText,
  notes: optionalText,
});

export const personCoreFieldsObjectSchema = z.object({
  full_name: z.string().trim().min(2, "Nome completo é obrigatório").max(160),
  first_name: optionalText,
  last_name: optionalText,
  preferred_name: optionalText,
  photo_url: optionalText,
  sex: z.enum(personSexOptions).optional(),
  birth_date: optionalText,
  marital_status: optionalText,
  nationality: optionalText,
  birth_place: optionalText,
  province: optionalText,
  municipality: optionalText,
  commune: optionalText,
  address: optionalText,
  phone_primary: optionalText,
  phone_alternative: optionalText,
  whatsapp: optionalText,
  email: z
    .union([z.literal(""), z.string().trim().email()])
    .optional()
    .transform((value) => (value ? value : undefined)),
  nif: optionalText,
  profession: optionalText,
  religion: optionalText,
  special_needs: optionalText,
  notes: optionalText,
});

function refinePersonNif<T extends { nif?: string | undefined }>(value: T, ctx: z.RefinementCtx) {
  if (!value.nif) return;
  const checked = validateAngolaNif(value.nif);
  if (!checked.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: checked.error ?? "NIF/BI inválido.",
      path: ["nif"],
    });
  }
}

function refinePersonPhone<
  T extends { phone_primary?: string | undefined; phone_alternative?: string | undefined },
>(value: T, ctx: z.RefinementCtx) {
  if (value.phone_primary) {
    const checked = validateAngolaPhone(value.phone_primary);
    if (!checked.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: checked.error ?? "Telefone inválido.",
        path: ["phone_primary"],
      });
    }
  }
  if (value.phone_alternative) {
    const checked = validateAngolaPhone(value.phone_alternative);
    if (!checked.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: checked.error ?? "Telefone alternativo inválido.",
        path: ["phone_alternative"],
      });
    }
  }
}

export const personCoreFieldsSchema = personCoreFieldsObjectSchema
  .superRefine(refinePersonNif)
  .superRefine(refinePersonPhone);

/** Normaliza números de telefone angolanos antes de persistir. */
export function normalizePersonPhone(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const result = validateAngolaPhone(value);
  return result.ok ? (result.compact ?? normalizeAngolaPhone(value)) : value.trim();
}

export const createPersonInputSchema = z.object({
  person: personCoreFieldsSchema,
  roles: z.array(z.enum(personRoleOptions)).default([]),
  documents: z.array(personDocumentInputSchema).default([]),
  relationships: z.array(personRelationshipInputSchema).default([]),
  duplicateDecision: optionalText,
});
export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;

export const searchPeopleInputSchema = z.object({
  query: z.string().trim().max(160).default(""),
  limit: z.number().int().min(1).max(50).default(20),
});
export type SearchPeopleInput = z.infer<typeof searchPeopleInputSchema>;

export const findPersonDuplicatesInputSchema = z.object({
  fullName: z.string().trim().min(2),
  birthDate: optionalText,
  documentNumber: optionalText,
  nif: optionalText,
  phone: optionalText,
  email: optionalText,
});
export type FindPersonDuplicatesInput = z.infer<typeof findPersonDuplicatesInputSchema>;

export const getPersonInputSchema = z.object({ id: z.string().uuid() });

export const mergePeopleInputSchema = z.object({
  survivorId: z.string().uuid(),
  duplicateId: z.string().uuid(),
  reason: z.string().trim().min(3, "Indica o motivo da mesclagem"),
});
export type MergePeopleInput = z.infer<typeof mergePeopleInputSchema>;

export const staffRoleOptions = ["professor", "funcionario", "diretor", "coordenador"] as const;

export const updatePersonStatusInputSchema = z.object({
  personId: z.string().uuid(),
  status: z.enum(["active", "inactive"]),
});
export type UpdatePersonStatusInput = z.infer<typeof updatePersonStatusInputSchema>;

export const updatePersonInputSchema = z
  .object({
    personId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(160),
    email: z.union([z.literal(""), z.string().trim().email()]).optional(),
    phone: optionalText,
    nif: optionalText,
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
  });
export type UpdatePersonInput = z.infer<typeof updatePersonInputSchema>;

export const setPersonPhotoUrlInputSchema = z.object({
  personId: z.string().uuid(),
  photoUrl: z.string().trim().url().max(800),
});
export type SetPersonPhotoUrlInput = z.infer<typeof setPersonPhotoUrlInputSchema>;

export const addPersonDocumentInputSchema = z.object({
  personId: z.string().uuid(),
  document: personDocumentInputSchema,
});
export type AddPersonDocumentInput = z.infer<typeof addPersonDocumentInputSchema>;

export const createTeacherInputSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  phone: optionalText,
  employeeNumber: optionalText,
  hiredOn: optionalText,
});
export type CreateTeacherInput = z.infer<typeof createTeacherInputSchema>;

export const updateTeacherInputSchema = z.object({
  teacherId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(160),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  phone: optionalText,
  status: z.enum(["active", "inactive"]).default("active"),
});
export type UpdateTeacherInput = z.infer<typeof updateTeacherInputSchema>;

export const deleteTeacherInputSchema = z.object({
  teacherId: z.string().uuid(),
});
export type DeleteTeacherInput = z.infer<typeof deleteTeacherInputSchema>;

export const listTeachersInputSchema = z.object({
  query: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  limit: z.number().int().min(1).max(200).default(100),
});
export type ListTeachersInput = z.infer<typeof listTeachersInputSchema>;
