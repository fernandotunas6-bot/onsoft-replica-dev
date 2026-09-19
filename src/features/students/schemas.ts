import { z } from "zod";
import { personCoreFieldsSchema } from "@/features/people/schemas";

export const studentStatusOptions = [
  "active",
  "inactive",
  "transferred",
  "graduated",
  "applicant",
  "cancelled",
  "suspended",
  "locked",
] as const;

export const searchStudentsInputSchema = z.object({
  query: z.string().trim().optional(),
  limit: z.number().int().min(1).max(1000).default(25),
  offset: z.number().int().min(0).default(0),
  academicYearId: z.string().uuid().optional(),
  classGroupId: z.string().uuid().optional(),
  status: z.string().trim().optional(),
  paymentStatus: z.string().trim().optional(),
  quickFilter: z.string().trim().optional(),
});
export type SearchStudentsInput = z.infer<typeof searchStudentsInputSchema>;

export const getStudentInputSchema = z.object({ id: z.string().uuid() });

export const getStudentStatusHistoryInputSchema = z.object({
  studentId: z.string().uuid(),
});
export type GetStudentStatusHistoryInput = z.infer<typeof getStudentStatusHistoryInputSchema>;

export const batchAssignClassInputSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(100),
  classGroupId: z.string().uuid(),
  academicYearId: z.string().uuid(),
});
export type BatchAssignClassInput = z.infer<typeof batchAssignClassInputSchema>;

export const batchUpdateStudentStatusInputSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(100),
  newStatus: z.enum(studentStatusOptions),
  reason: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
});
export type BatchUpdateStudentStatusInput = z.infer<typeof batchUpdateStudentStatusInputSchema>;

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const studentGuardianInputSchema = z.object({
  guardian_person_id: z.string().uuid(),
  relationship: z.string().trim().min(1),
  is_primary: z.boolean().default(false),
  authorized_pickup: z.boolean().default(true),
});

/** SGA student_guardians_relationship_check: father|mother|guardian|grandparent|sibling|other */
const sgaGuardianRelationshipMap: Record<string, string> = {
  pai: "father",
  father: "father",
  mae: "mother",
  mother: "mother",
  encarregado: "guardian",
  guardian: "guardian",
  tutor: "guardian",
  avo: "grandparent",
  grandparent: "grandparent",
  irmao: "sibling",
  sibling: "sibling",
  conjuge: "other",
  contacto_emergencia: "other",
  responsavel_financeiro: "other",
  responsavel_autorizado_buscar: "other",
  other: "other",
};

export function mapSgaGuardianRelationship(value: string): string {
  const key = value.trim().toLowerCase();
  return sgaGuardianRelationshipMap[key] ?? "other";
}

export const createStudentInputSchema = z.object({
  personId: z.string().uuid(),
  registrationNumber: z.string().trim().min(1, "Número de processo é obrigatório"),
  classGroupId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  admittedOn: optionalText,
  guardians: z.array(studentGuardianInputSchema).default([]),
});
export type CreateStudentInput = z.infer<typeof createStudentInputSchema>;

export const enrollNewStudentInputSchema = z.object({
  person: personCoreFieldsSchema,
  // Não persistido: o nº do aluno (EST-######) é gerado pela sequência própria
  // do RPC `register_student`. Mantido opcional só por compatibilidade de tipos.
  registrationNumber: optionalText,
  classGroupId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  admittedOn: optionalText,
  guardians: z.array(studentGuardianInputSchema).default([]),
  duplicateDecision: optionalText,
});
export type EnrollNewStudentInput = z.infer<typeof enrollNewStudentInputSchema>;

export const changeStudentStatusInputSchema = z.object({
  studentId: z.string().uuid(),
  newStatus: z.enum(studentStatusOptions),
  reason: optionalText,
});
export type ChangeStudentStatusInput = z.infer<typeof changeStudentStatusInputSchema>;

export const updateStudentProfileInputSchema = z.object({
  personId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  fullName: z.string().trim().min(2).max(160),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  phone: optionalText,
  province: optionalText,
  municipality: optionalText,
  commune: optionalText,
  address: optionalText,
});

export const enrollStudentInClassInputSchema = z.object({
  studentId: z.string().uuid(),
  classGroupId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  enrolledOn: optionalText,
});
export type EnrollStudentInClassInput = z.infer<typeof enrollStudentInClassInputSchema>;

export const updateEnrollmentInputSchema = z.object({
  enrollmentId: z.string().uuid(),
  classGroupId: z.string().uuid(),
  status: z.enum(["active", "inactive", "transferred", "withdrawn"]).default("active"),
});
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentInputSchema>;

export const cancelEnrollmentInputSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason: optionalText,
});
export type CancelEnrollmentInput = z.infer<typeof cancelEnrollmentInputSchema>;

export const listEnrollmentsInputSchema = z.object({
  academicYearId: z.string().uuid().optional(),
  classGroupId: z.string().uuid().optional(),
  status: z.string().trim().optional(),
  query: z.string().trim().optional(),
  limit: z.number().int().min(1).max(250).default(100),
});
export type ListEnrollmentsInput = z.infer<typeof listEnrollmentsInputSchema>;

export const assignGuardianInputSchema = z.object({
  studentId: z.string().uuid(),
  guardianPersonId: z.string().uuid(),
  relationship: z.string().trim().min(1).max(40),
  isPrimary: z.boolean().default(false),
});
export type AssignGuardianInput = z.infer<typeof assignGuardianInputSchema>;

export const removeGuardianInputSchema = z.object({
  studentId: z.string().uuid(),
  guardianPersonId: z.string().uuid(),
});
export type RemoveGuardianInput = z.infer<typeof removeGuardianInputSchema>;

export const updateEnrollmentAttendanceInputSchema = z.object({
  enrollmentId: z.string().uuid(),
  attendanceRate: z.coerce.number().min(0, "Mínimo 0%").max(100, "Máximo 100%"),
});
export type UpdateEnrollmentAttendanceInput = z.infer<typeof updateEnrollmentAttendanceInputSchema>;

export function averagePercent(values: Array<number | null | undefined>): number | null {
  const nums = values
    .map((value) => (value == null ? NaN : Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  if (!nums.length) return null;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}
