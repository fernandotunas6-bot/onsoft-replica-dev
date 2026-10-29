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
  teacherDocumentCodes,
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

    const [policy, levels, entriesResult] = await Promise.all([
      readSettingsDomain(db, membership.schoolId, "teacher_documents"),
      assignedTeachingLevels(db, membership.schoolId, data.teacherId),
      db.from("teacher_document_entries")
        .select("id, file_id, document_code, validation_status, validation_notes, verified_at, created_at")
        .eq("school_id", membership.schoolId)
        .eq("teacher_id", data.teacherId)
        .eq("person_id", teacher.personId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (entriesResult.error) {
      throw publicDatabaseError(entriesResult.error,
        "Não foi possível ler o processo documental. Verifique a migração teacher_document_entries.");
    }
    const entries = entriesResult.data ?? [];
    const identifiers = entries.map((entry) => entry.file_id);
    const fileResult = identifiers.length
      ? await db.from("siga_files")
        .select("id, title, name")
        .eq("school_id", membership.schoolId)
        .eq("related_person_id", teacher.personId)
        .eq("area", "secretaria")
        .eq("visibility", "private")
        .eq("storage_backend", "sga")
        .eq("is_folder", false)
        .eq("is_system", false)
        .is("deleted_at", null)
        .in("id", identifiers)
      : { data: [] as Array<{ id: string; title: string | null; name: string }>, error: null };
    if (fileResult.error) {
      throw publicDatabaseError(fileResult.error, "Não foi possível validar os anexos reservados.");
    }
    const fileById = new Map((fileResult.data ?? []).map((file) => [file.id, file]));
    const files = entries.filter((entry) => fileById.has(entry.file_id))
      .map((entry) => ({
        id: entry.file_id,
        entryId: entry.id,
        title: String(fileById.get(entry.file_id)?.title || fileById.get(entry.file_id)?.name || "Documento"),
        code: entry.document_code,
        validationStatus: entry.validation_status,
        validationNotes: managerial ? entry.validation_notes : null,
        verifiedAt: entry.verified_at,
        receivedAt: entry.created_at,
      }));
    const base = teacherDocumentChecklist(policy, [], levels);
    const items = base.map((item) => {
      const matches = files.filter((file) => file.code === item.code);
      const latest = matches.find((file) => file.validationStatus === "verified")
        ?? matches.find((file) => file.validationStatus === "received")
        ?? matches[0];
      const received = Boolean(latest && latest.validationStatus !== "rejected");
      return { ...item, received,
        verified: latest?.validationStatus === "verified",
        status: !latest ? "em_falta" as const
          : latest.validationStatus === "rejected" ? "rejeitado" as const
          : latest.validationStatus === "verified" ? "validado" as const
          : "recebido" as const,
      };
    });
    return {
      teacherId: data.teacherId,
      policyEnabled: policy.enabled,
      levels,
      items,
      files,
    };
  });

/** Liga documento privado existente ao processo individual; preserva reference_code, título e histórico do Arquivo. */
export const attachTeacherDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador", "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const teacher = await requireTeacherDocumentTarget(db, membership.schoolId, data.teacherId);
    const { data: file, error } = await db.from("siga_files")
      .select("id, is_folder, is_system, storage_backend")
      .eq("id", data.fileId)
      .eq("school_id", membership.schoolId)
      .eq("related_person_id", teacher.personId)
      .eq("area", "secretaria")
      .eq("visibility", "private")
      .is("deleted_at", null).maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível validar o anexo.");
    if (!file || file.is_folder || file.is_system || file.storage_backend !== "sga") {
      throw new Error("Escolha um documento privado e relacionado com este professor na Secretaria.");
    }
    const doc = TEACHER_DOCUMENTS.find((item) => item.code === data.documentCode);
    if (!doc) throw new Error("Tipo de documento não reconhecido.");
    const { data: existing, error: existingError } = await db
      .from("teacher_document_entries").select("id, document_code")
      .eq("school_id", membership.schoolId).eq("file_id", data.fileId).maybeSingle();
    if (existingError) throw publicDatabaseError(existingError, "Não foi possível validar o registo documental.");
    if (existing) {
      if (existing.document_code !== doc.code) {
        throw new Error("Este arquivo já está associado a outro tipo documental. Seleccione outro ficheiro.");
      }
      return { id: String(existing.id), documentCode: doc.code, state: "recebido" as const };
    }
    const { data: result, error: insertError } = await db.from("teacher_document_entries")
      .insert({
        school_id: membership.schoolId,
        teacher_id: data.teacherId,
        person_id: teacher.personId,
        file_id: data.fileId,
        document_code: doc.code,
        created_by: context.userId,
        updated_by: context.userId,
      }).select("id").single();
    if (insertError) throw publicDatabaseError(insertError, "Não foi possível associar o documento.");
    return { id: String(result.id), documentCode: doc.code, state: "recebido" as const };
  });

const reviewInput = teacherInput.extend({
  entryId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().trim().min(3).max(700),
});

/** A validação é explícita e auditável; enviar não equivale a documento verificado. */
export const reviewTeacherDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId,
      ["Administrador", "Secretaria"]);
    const db = await loadSgaAdminClient();
    const teacher = await requireTeacherDocumentTarget(db, membership.schoolId, data.teacherId);
    const { data: reviewed, error } = await db.from("teacher_document_entries")
      .update({
        validation_status: data.decision,
        validation_notes: data.reason,
        verified_by: context.userId,
        verified_at: new Date().toISOString(),
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }).eq("id", data.entryId)
      .eq("school_id", membership.schoolId)
      .eq("teacher_id", data.teacherId)
      .eq("person_id", teacher.personId)
      .select("id, validation_status").maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível validar este documento.");
    if (!reviewed) throw new Error("O documento não pertence ao processo deste professor.");
    return { id: reviewed.id, status: reviewed.validation_status };
  });
