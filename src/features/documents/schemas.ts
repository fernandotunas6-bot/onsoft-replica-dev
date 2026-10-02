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
  /**
   * Vocabulário da INTERFACE. O servidor traduz para o da base (`uiStatusToSga` em
   * documents/server.ts) antes de gravar.
   *
   * O comentário anterior dizia "Allowed by `document_requests_status_check`" e a lista
   * não era essa — a base admite submitted|in_review|approved|rejected|fulfilled|cancelled,
   * e destes seis só `cancelled` coincidia. Na prática só se conseguia cancelar um pedido.
   * `pending_payment` sai da lista: não tem correspondência nenhuma na base.
   */
  status: z.enum(["queued", "processing", "ready", "delivered", "rejected", "cancelled"]),
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

/**
 * Código activo num modelo de impressão: scripts, handlers `on…=`, URLs
 * `javascript:` e documentos embutidos. O modelo é HTML da escola e corre no
 * browser de quem imprime; nada disto é preciso para um documento.
 */
export const ACTIVE_TEMPLATE_CONTENT =
  /<\s*(script|iframe|object|embed)\b|[\s"'/]on[a-z]+\s*=|javascript\s*:|srcdoc\s*=/i;

export const savePrintTemplateInputSchema = z.object({
  key: printTemplateKeySchema,
  source: z
    .string()
    .trim()
    .min(20)
    .max(80_000)
    .refine((source) => !ACTIVE_TEMPLATE_CONTENT.test(source), {
      message: "O modelo não pode ter scripts, eventos (on…=) nem ligações javascript:.",
    }),
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
