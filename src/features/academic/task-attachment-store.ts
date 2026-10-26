import { readInChunks } from "@/integrations/supabase/read-all-pages";
/**
 * Guardar e ler os anexos das entregas no arquivo da escola (`siga_files`, bucket
 * privado `siga-files`). Só o servidor escreve: o bucket não aceita envios de
 * alunos, e assim o tipo, o tamanho, a quota do plano e o caminho são decididos
 * aqui. O ficheiro fica na área pessoal do aluno, privado; o professor abre-o
 * pela entrega (`openTaskSubmissionFile`), não pelos Arquivos.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { assertCanStoreBytesForSchool } from "@/features/saas/tenant-limits-server";
import {
  ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  matchesSignature,
  safeAttachmentName,
  type AttachmentInfo,
  type AttachmentType,
} from "./task-attachments";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;

export const FILES_BUCKET = "siga-files";

export type AttachmentUpload = { name: string; contentType: AttachmentType; base64: string };

/** Confere, guarda os bytes e regista o ficheiro. Devolve o id para `file_id`. */
export async function storeTaskAttachment(
  db: Db,
  input: {
    schoolId: string;
    userId: string;
    taskId: string;
    enrollmentId: string;
    classGroupId: string | null;
    title: string;
    upload: AttachmentUpload;
  },
): Promise<{ fileId: string; storagePath: string }> {
  const bytes = Buffer.from(input.upload.base64, "base64");
  if (!bytes.byteLength) throw new Error("O anexo está vazio.");
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("O anexo deve ter no máximo 5 MB.");
  }
  if (!matchesSignature(new Uint8Array(bytes), input.upload.contentType)) {
    throw new Error("O ficheiro não é um PDF nem uma imagem (JPG, PNG, WebP) válida.");
  }
  await assertCanStoreBytesForSchool(input.schoolId, bytes.byteLength);

  const id = crypto.randomUUID();
  const extension = ATTACHMENT_EXTENSIONS[input.upload.contentType];
  // Caminho só do servidor: nada do nome que o navegador mandou.
  const storagePath = `${input.schoolId}/trabalhos/${input.taskId}/${input.enrollmentId}/${id}.${extension}`;
  const { error: uploadError } = await db.storage
    .from(FILES_BUCKET)
    .upload(storagePath, bytes, { contentType: input.upload.contentType, upsert: false });
  if (uploadError) throw publicDatabaseError(uploadError, "Não foi possível guardar o anexo.");

  const now = new Date().toISOString();
  const { error } = await db.from("siga_files").insert({
    id,
    school_id: input.schoolId,
    owner_user_id: input.userId,
    name: safeAttachmentName(input.upload.name, input.upload.contentType),
    mime: input.upload.contentType,
    size_bytes: bytes.byteLength,
    area: "pessoal",
    visibility: "private",
    storage_backend: "sga",
    storage_path: storagePath,
    class_group_id: input.classGroupId,
    parent_id: null,
    is_folder: false,
    title: input.title.slice(0, 160),
    category: "outro",
    document_date: now.slice(0, 10),
    related_user_id: input.userId,
    is_system: true,
    created_by: input.userId,
    updated_at: now,
    updated_by: input.userId,
    last_action: "created",
    last_action_at: now,
    last_action_by: input.userId,
  });
  if (error) {
    await db.storage.from(FILES_BUCKET).remove([storagePath]);
    throw publicDatabaseError(error, "Não foi possível registar o anexo.");
  }
  return { fileId: id, storagePath };
}

/** A entrega não ficou gravada: o anexo não fica órfão nem conta para a quota. */
export async function discardTaskAttachment(
  db: Db,
  schoolId: string,
  stored: { fileId: string; storagePath: string },
) {
  await db.from("siga_files").delete().eq("school_id", schoolId).eq("id", stored.fileId);
  await db.storage.from(FILES_BUCKET).remove([stored.storagePath]);
}

/** Nome, tipo e tamanho dos anexos de um conjunto de entregas. */
export async function loadAttachmentInfo(
  db: Db,
  schoolId: string,
  fileIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, AttachmentInfo>> {
  const ids = [...new Set(fileIds.filter((id): id is string => Boolean(id)))];
  const result = new Map<string, AttachmentInfo>();
  if (!ids.length) return result;
  const { data, error } = await readInChunks(ids, (chunk) =>
    db
      .from("siga_files")
      .select("id, name, mime, size_bytes")
      .eq("school_id", schoolId)
      .in("id", chunk)
      .is("deleted_at", null),
  );
  if (error) throw publicDatabaseError(error, "Não foi possível ler os anexos.");
  for (const row of (data ?? []) as Row[]) {
    result.set(String(row.id), {
      id: String(row.id),
      name: String(row.name ?? "Anexo"),
      mime: String(row.mime ?? ""),
      sizeBytes: Number(row.size_bytes ?? 0),
    });
  }
  return result;
}
