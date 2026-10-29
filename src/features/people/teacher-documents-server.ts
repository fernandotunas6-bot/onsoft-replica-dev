import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { readSettingsDomain } from "@/features/school/settings-domains";
import { resolveTeacherLevels } from "@/features/people/teacher-profile-context";
import {
  teacherDocumentChecklist,
  teacherDocumentCodeFromFile,
  teacherDocumentCodes,
  teacherDocumentFileCode,
  TEACHER_DOCUMENTS,
} from "@/features/people/teacher-documents-policy";

const teacherInput = z.object({ teacherId: z.string().uuid() });
const linkInput = teacherInput.extend({
  fileId: z.string().uuid(),
  documentCode: z.string().refine((value) => (teacherDocumentCodes as string[]).includes(value)),
});
type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** A pessoa é a mesma; os documentos e a configuração pertencem à escola activa. */
async function requireTeacherDocumentTarget(db: Db, schoolId: string, teacherId: string) {
  const { data: teacher, error } = await db
    .from("teachers")
    .select("id, person_id, user_id")
    .eq("id", teacherId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o professor.");
  if (!teacher?.person_id) throw new Error("Professor não encontrado nesta escola.");
  const { data: person, error: personError } = await db
    .from("people")
    .select("id, user_id")
    .eq("school_id", schoolId)
    .eq("id", teacher.person_id)
    .maybeSingle();
  if (personError) throw publicDatabaseError(personError, "Não foi possível validar a pessoa.");
  if (!person) throw new Error("O professor não tem um cadastro pessoal válido.");
  return {
    teacherId,
    personId: String(person.id),
    userId: String(teacher.user_id || person.user_id || ""),
  };
}

async function assignedTeachingLevels(
  db: Db,
  schoolId: string,
  teacherId: string,
): Promise<string[]> {
  const { data: assignments, error } = await db
    .from("class_subjects")
    .select("class_group_id")
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherId)
    .eq("status", "active");
  if (error) throw publicDatabaseError(error, "Não foi possível consultar os níveis atribuídos.");
  const ids = [...new Set((assignments ?? []).map((row) => String(row.class_group_id)))];
  if (!ids.length) return [];
  const { data: groups, error: groupError } = await db
    .from("class_groups")
    .select("name, grade_level_id")
    .eq("school_id", schoolId)
    .in("id", ids);
  if (groupError) throw publicDatabaseError(groupError, "Não foi possível carregar as turmas.");
  const gradeIds = [
    ...new Set((groups ?? []).map((row) => row.grade_level_id).filter(Boolean)),
  ] as string[];
  const { data: grades, error: gradeError } = gradeIds.length
    ? await db.from("grade_levels").select("id, name").eq("school_id", schoolId).in("id", gradeIds)
    : { data: [], error: null };
  if (gradeError) throw publicDatabaseError(gradeError, "Não foi possível ler as classes.");
  const byId = new Map((grades ?? []).map((grade) => [String(grade.id), String(grade.name)]));
  return resolveTeacherLevels(
    (groups ?? []).map((group) => byId.get(String(group.grade_level_id)) || String(group.name)),
    [],
  ).assigned;
}

/**
 * Só Administração/Secretaria ou o próprio docente consultam os metadados.
 * Não devolve o conteúdo, caminho Storage, BI ou dados médicos. O acesso ao
 * próprio ficheiro obedece ao arquivo reservado e às suas políticas.
 */
export const getTeacherDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => teacherInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const teacher = await requireTeacherDocumentTarget(db, membership.schoolId, data.teacherId);
    const managerial = ["Administrador", "Secretaria"].includes(membership.appRole);
    if (!managerial && teacher.userId !== context.userId) {
      throw new Error("Só pode consultar os documentos da sua própria ficha.");
    }

    const [policy, levels, fileResult] = await Promise.all([
      readSettingsDomain(db, membership.schoolId, "teacher_documents"),
      assignedTeachingLevels(db, membership.schoolId, data.teacherId),
      db
        .from("siga_files")
        .select("id, title, name, reference_code, category, created_at")
        .eq("school_id", membership.schoolId)
        .eq("related_person_id", teacher.personId)
        .eq("area", "secretaria")
        .eq("visibility", "private")
        .eq("storage_backend", "sga")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (fileResult.error) {
      throw publicDatabaseError(
        fileResult.error,
        "Não foi possível consultar os documentos do professor.",
      );
    }
    const files = (fileResult.data ?? [])
      .filter((file) => teacherDocumentCodeFromFile(file.reference_code))
      .map((file) => ({
        id: String(file.id),
        title: String(file.title || file.name),
        code: teacherDocumentCodeFromFile(file.reference_code)!,
        receivedAt: String(file.created_at),
      }));
    return {
      teacherId: data.teacherId,
      policyEnabled: policy.enabled,
      levels,
      items: teacherDocumentChecklist(
        policy,
        files.map((file) => teacherDocumentFileCode(file.code, file.id)),
        levels,
      ),
      files,
    };
  });

/** Classifica um ficheiro privado já carregado para ESTA pessoa, sem mudar o proprietário. */
export const attachTeacherDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const teacher = await requireTeacherDocumentTarget(db, membership.schoolId, data.teacherId);
    const { data: file, error } = await db
      .from("siga_files")
      .select("id, is_folder, is_system, storage_backend")
      .eq("id", data.fileId)
      .eq("school_id", membership.schoolId)
      .eq("related_person_id", teacher.personId)
      .eq("area", "secretaria")
      .eq("visibility", "private")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível validar o anexo.");
    if (!file || file.is_folder || file.is_system || file.storage_backend !== "sga") {
      throw new Error(
        "Seleccione um documento privado, associado a esta pessoa e guardado na Secretaria.",
      );
    }
    const doc = TEACHER_DOCUMENTS.find((item) => item.code === data.documentCode);
    if (!doc) throw new Error("Tipo de documento não reconhecido.");
    const { data: result, error: updateError } = await db
      .from("siga_files")
      .update({
        category: doc.category,
        reference_code: teacherDocumentFileCode(doc.code, data.fileId),
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
        last_action: "metadata_updated",
        last_action_at: new Date().toISOString(),
        last_action_by: context.userId,
      })
      .eq("id", data.fileId)
      .eq("school_id", membership.schoolId)
      .eq("related_person_id", teacher.personId)
      .eq("area", "secretaria")
      .eq("visibility", "private")
      .select("id")
      .maybeSingle();
    if (updateError)
      throw publicDatabaseError(updateError, "Não foi possível classificar o documento.");
    if (!result) throw new Error("O documento já não está disponível nesta escola.");
    return { id: String(result.id), documentCode: doc.code, state: "recebido" as const };
  });
