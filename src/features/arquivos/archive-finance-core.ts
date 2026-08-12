import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { generateDocumentCode, normalizeDocumentCode } from "./document-code";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

const FILES_BUCKET = "siga-files";

export async function insertFinanceArchive(
  db: AdminDb,
  input: {
    schoolId: string;
    userId: string;
    area: "secretaria" | "escola";
    category: "recibo" | "talao" | "fatura";
    title: string;
    description: string;
    relatedPersonId?: string | null;
    sourceLabel?: string;
    amountLabel?: string;
    documentCode?: string;
  },
) {
  const documentCode = input.documentCode?.trim()
    ? normalizeDocumentCode(input.documentCode)
    : generateDocumentCode(input.category);

  const { data: existing } = await db
    .from("siga_files")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("reference_code", documentCode)
    .maybeSingle();
  if (existing?.id) {
    return { documentCode, fileId: String(existing.id), reused: true as const, storage: "sga" as const };
  }

  const id = crypto.randomUUID();
  const body = [
    "SIGA · arquivo financeiro",
    `ID: ${documentCode}`,
    `Categoria: ${input.category}`,
    `Título: ${input.title}`,
    input.sourceLabel ? `Origem: ${input.sourceLabel}` : null,
    input.amountLabel ? `Valor: ${input.amountLabel}` : null,
    "",
    input.description,
  ]
    .filter(Boolean)
    .join("\n");
  const bytes = Buffer.from(body, "utf8");
  const now = new Date();
  const storagePath = `${input.schoolId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${input.area}/${input.userId}/${id}-${documentCode}.txt`;
  let storageBackend: "sga" | "local" = "local";
  try {
    const { error: upError } = await db.storage.from(FILES_BUCKET).upload(storagePath, bytes, {
      upsert: false,
      contentType: "text/plain",
    });
    if (!upError) storageBackend = "sga";
  } catch {
    storageBackend = "local";
  }

  const iso = now.toISOString();
  const payload = {
    id,
    school_id: input.schoolId,
    owner_user_id: input.userId,
    name: `${documentCode}.txt`,
    mime: "text/plain",
    size_bytes: Math.max(bytes.byteLength, 1),
    area: input.area,
    visibility: "school",
    storage_backend: storageBackend,
    storage_path: storagePath,
    class_group_id: null as string | null,
    parent_id: null as string | null,
    is_folder: false,
    title: input.title,
    description: input.description,
    category: input.category,
    document_date: iso.slice(0, 10),
    reference_code: documentCode,
    related_user_id: null as string | null,
    related_person_id: input.relatedPersonId ?? null,
    created_by: input.userId,
    updated_at: iso,
    updated_by: input.userId,
    last_action: "created",
    last_action_at: iso,
    last_action_by: input.userId,
  };

  const { error } = await db.from("siga_files").insert(payload);
  if (error) {
    if (/42P01|schema cache|does not exist|42703|reference_code|related_person|category/i.test(error.message)) {
      return {
        documentCode,
        fileId: id,
        reused: false as const,
        storage: "local" as const,
        skipped: true as const,
      };
    }
    throw error;
  }

  return {
    documentCode,
    fileId: id,
    reused: false as const,
    storage: storageBackend,
  };
}
