/**
 * Anexos de mensagens (chat e mensagens directas) — auditoria 13.
 *
 * Antes, o anexo abria com `signSchoolFile`, que só serve o pessoal: um
 * encarregado ou um aluno recebia o anexo do professor e não o conseguia abrir.
 * E o envio aceitava qualquer id de ficheiro da escola com o nome que o browser
 * mandasse.
 *
 * Agora quem envia só anexa o que ele próprio pode abrir (a mesma regra dos
 * Arquivos), o nome vem da base, e quem participa na conversa abre o anexo pela
 * mensagem. Ao abrir, a regra volta a ser verificada para quem enviou: a RLS
 * deixa um membro gravar mensagens directamente, e um anexo gravado assim não
 * pode servir para ler um ficheiro a que o autor não tem acesso.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  canSeeFileMetadata,
  canAccessFileContent,
  type FileArea,
  type FileVisibility,
} from "@/features/arquivos/kinds";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export type AttachableFile = {
  id: string;
  name: string;
  area: FileArea;
  visibility: FileVisibility;
  ownerUserId: string;
  relatedUserId: string | null;
  isFolder: boolean;
  isSystem: boolean;
  storageBackend: string;
  storagePath: string;
};

/** Quem envia pode partilhar este ficheiro numa mensagem? */
export function canShareFileInMessage(
  file: AttachableFile,
  senderId: string,
  senderRoles: readonly string[],
): boolean {
  if (file.isFolder) return false;
  return senderRoles.some(
    (role) =>
      canSeeFileMetadata(file, senderId, role) && canAccessFileContent(file, senderId, role),
  );
}

export async function loadAttachableFile(
  db: AdminDb,
  schoolId: string,
  fileId: string,
): Promise<AttachableFile | null> {
  const { data, error } = await db
    .from("siga_files")
    .select(
      "id, name, area, visibility, owner_user_id, related_user_id, is_folder, is_system, storage_backend, storage_path",
    )
    .eq("id", fileId)
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível ler o anexo.");
  if (!data) return null;
  return {
    id: String(data.id),
    name: String(data.name ?? "Anexo"),
    area: data.area as FileArea,
    visibility: data.visibility as FileVisibility,
    ownerUserId: String(data.owner_user_id),
    relatedUserId: data.related_user_id ? String(data.related_user_id) : null,
    isFolder: Boolean(data.is_folder),
    isSystem: Boolean(data.is_system),
    storageBackend: String(data.storage_backend ?? "sga"),
    storagePath: String(data.storage_path ?? ""),
  };
}

/** No envio: o ficheiro é da escola e quem envia pode abri-lo. Devolve o nome da base. */
export async function assertSenderMayAttach(
  db: AdminDb,
  input: { schoolId: string; senderId: string; senderRoles: readonly string[]; fileId: string },
): Promise<{ id: string; name: string }> {
  const file = await loadAttachableFile(db, input.schoolId, input.fileId);
  if (!file || !canShareFileInMessage(file, input.senderId, input.senderRoles)) {
    throw new Error("Não pode anexar este ficheiro.");
  }
  return { id: file.id, name: file.name.slice(0, 255) };
}
