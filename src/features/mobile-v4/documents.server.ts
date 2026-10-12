/**
 * Documentos do aluno no Mobile V4 — os pedidos que `listDocumentWorkspace`
 * (src/features/documents/server.ts) já mostra ao aluno, e só os dele: o aluno
 * vem do âmbito académico verificado, nunca do pedido. Sem a nota interna da
 * revisão (`review_note`), que o portal também não mostra ao aluno. Só leitura:
 * no SIGA os pedidos são registados pela secretaria.
 */
import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import {
  documentStatuses,
  parseStudentDocuments,
  type DocumentStatus,
  type StudentDocuments,
} from "../../../mobile-v4/src/domain/documents";
import { MobileApiError } from "./errors";

type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function read<T>(
  query: PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>,
): Promise<T[]> {
  const r = await query;
  if (r.error || !r.data || r.count == null || r.count !== r.data.length)
    throw new MobileApiError(503, "DOCUMENTS_UNAVAILABLE");
  return r.data;
}
const filled = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function readMobileDocuments(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
): Promise<StudentDocuments> {
  if (scope.role !== "aluno" || !scope.studentId)
    throw new MobileApiError(403, "DOCUMENTS_STUDENT_ONLY");
  const [requests, templates] = await Promise.all([
    read<{
      id: string;
      template_id: string | null;
      request_type: string | null;
      status: string;
      purpose: string | null;
      created_at: string;
      updated_at: string | null;
    }>(
      db
        .from("document_requests")
        .select("id, template_id, request_type, status, purpose, created_at, updated_at", {
          count: "exact",
        })
        .eq("school_id", scope.schoolId)
        .eq("student_id", scope.studentId)
        .limit(500),
    ),
    read<{ id: string; name: string; document_type: string | null; status: string }>(
      db
        .from("document_templates")
        .select("id, name, document_type, status", { count: "exact" })
        .eq("school_id", scope.schoolId)
        .limit(1000),
    ),
  ]);
  const templateName = new Map(templates.map((t) => [t.id, filled(t.name)]));
  if (requests.some((r) => !documentStatuses.includes(r.status as DocumentStatus)))
    throw new MobileApiError(503, "DOCUMENTS_INCONSISTENT");
  const response: StudentDocuments = {
    schoolId: scope.schoolId,
    userId,
    role: "aluno",
    requests: requests
      .map((r) => ({
        id: r.id,
        document:
          (r.template_id ? templateName.get(r.template_id) : null) ??
          filled(r.request_type) ??
          "Documento",
        status: r.status as DocumentStatus,
        details: filled(r.purpose)?.slice(0, 1000) ?? null,
        requestedAt: r.created_at,
        updatedAt: r.updated_at ?? r.created_at,
      }))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || a.id.localeCompare(b.id)),
    available: templates
      .filter((t) => t.status === "active" && filled(t.name))
      .map((t) => ({
        name: filled(t.name)!,
        kind: (t.document_type === "certificate" || t.document_type === "declaration"
          ? t.document_type
          : "other") as StudentDocuments["available"][number]["kind"],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt")),
  };
  try {
    return parseStudentDocuments(response, {
      userId,
      schoolId: scope.schoolId,
      role: scope.role,
    });
  } catch {
    throw new MobileApiError(503, "DOCUMENTS_INCONSISTENT");
  }
}
