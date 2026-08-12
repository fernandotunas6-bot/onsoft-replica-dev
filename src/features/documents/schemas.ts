import { z } from "zod";

export const listDocumentsInputSchema = z.object({
  limit: z.number().int().min(1).max(250).default(100),
});

export const createDocumentRequestInputSchema = z.object({
  studentId: z.string().uuid(),
  templateId: z.string().uuid(),
  requestNumber: z.string().trim().min(1).max(64),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  dueOn: z.string().date().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreateDocumentRequestInput = z.infer<typeof createDocumentRequestInputSchema>;

export const updateDocumentRequestStatusInputSchema = z.object({
  requestId: z.string().uuid(),
  /** Allowed by SGA `document_requests_status_check`. */
  status: z.enum(["submitted", "in_review", "approved", "rejected", "cancelled"]),
});

export type UpdateDocumentRequestStatusInput = z.infer<
  typeof updateDocumentRequestStatusInputSchema
>;

export const printTemplateKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, "Modelo inválido.")
  .max(80);

export const getPrintTemplateInputSchema = z.object({
  key: printTemplateKeySchema,
});

export const savePrintTemplateInputSchema = z.object({
  key: printTemplateKeySchema,
  source: z.string().trim().min(20).max(80_000),
});

export const setActivePrintTemplateInputSchema = z.object({
  key: printTemplateKeySchema,
});

export const resetPrintTemplateInputSchema = z.object({
  key: printTemplateKeySchema,
});

export function officialDeclarationBody(input: {
  schoolName: string;
  studentName: string;
  registrationNumber: string;
  className?: string | null;
  academicYear: string;
}) {
  const turma = input.className ? `, matriculado(a) na turma ${input.className}` : "";
  return `A Direcção da ${input.schoolName} declara que ${input.studentName}, processo ${input.registrationNumber}${turma}, é aluno(a) desta instituição no ano lectivo ${input.academicYear}.`;
}
