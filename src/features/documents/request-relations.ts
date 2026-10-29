/**
 * Relações dos pedidos de documentos: os identificadores chegam do browser,
 * mas aluno e modelo têm de ser válidos NA escola da sessão.
 * O cliente Supabase é entregue pelo handler já autenticado/autorizado.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export async function requireDocumentRequestRelations(
  db: Db,
  input: { schoolId: string; studentId: string; templateId: string },
) {
  const [studentResult, templateResult] = await Promise.all([
    db
      .from("students")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("id", input.studentId)
      .maybeSingle(),
    db
      .from("document_templates")
      .select("id, name, document_type")
      .eq("school_id", input.schoolId)
      .eq("id", input.templateId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  // Erro de consulta não é "não encontrado": falhar fechado sem mascarar
  // indisponibilidade como ausência de um aluno ou de um modelo.
  if (studentResult.error) {
    throw publicDatabaseError(studentResult.error, "Não foi possível validar o aluno.");
  }
  if (templateResult.error) {
    throw publicDatabaseError(templateResult.error, "Não foi possível validar o modelo.");
  }
  if (!studentResult.data) {
    throw new Error("Aluno não encontrado nesta escola.");
  }
  if (!templateResult.data) {
    throw new Error("Modelo de documento activo não encontrado nesta escola.");
  }

  return templateResult.data;
}
