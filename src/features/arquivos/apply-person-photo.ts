import { supabase } from "@/integrations/supabase/client";
import { setPersonPhotoUrl } from "@/features/people/server";
import { resolveFileBlob } from "./resolve-file";
import type { SchoolFileRecord } from "./schemas";
import { updateSchoolFileMeta } from "./server";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Copia uma imagem da biblioteca para school-logos e actualiza people.photo_url. */
export async function applyLibraryPhotoToPerson(input: {
  personId: string;
  schoolId: string;
  file: SchoolFileRecord;
  /** Se false, não marca o ficheiro como foto relacionada à pessoa. */
  linkFileMeta?: boolean;
}) {
  if (input.file.kind !== "png" && input.file.kind !== "jpeg") {
    throw new Error("Use uma imagem PNG ou JPEG.");
  }
  const blob = await resolveFileBlob(input.file);
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("A imagem deve ter no máximo 4 MB.");
  }
  const extension = input.file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${input.schoolId}/people/${input.personId}-${Date.now()}.${extension}`;
  const asFile = new File([blob], input.file.name, { type: input.file.mime || blob.type });
  const { error } = await supabase.storage
    .from("school-logos")
    .upload(path, asFile, { upsert: true, cacheControl: "3600" });
  if (error) throw new Error(error.message || "Não foi possível guardar a foto.");
  const {
    data: { publicUrl },
  } = supabase.storage.from("school-logos").getPublicUrl(path);
  await setPersonPhotoUrl({ data: { personId: input.personId, photoUrl: publicUrl } });
  if (input.linkFileMeta !== false) {
    try {
      await updateSchoolFileMeta({
        data: {
          id: input.file.id,
          category: "foto",
          relatedPersonId: input.personId,
          title: input.file.title?.trim() || input.file.name,
        },
      });
    } catch {
      /* metadados opcionais se a coluna ainda não existir */
    }
  }
  return publicUrl;
}
