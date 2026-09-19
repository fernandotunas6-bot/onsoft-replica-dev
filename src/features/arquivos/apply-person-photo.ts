import { supabase } from "@/integrations/supabase/client";
import { setPersonPhotoUrl } from "@/features/people/server";
import type { SchoolFileRecord } from "./schemas";
import { kindFromFile } from "./kinds";
import { localStoragePath } from "./local-store";
import { registerSchoolFile, updateSchoolFileMeta } from "./server";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const FILES_BUCKET = "siga-files";

/**
 * Envia uma fotografia de pessoa para a biblioteca privada da escola e liga-a à
 * ficha. Fotografias — muitas delas de menores — nunca podem ir para um bucket
 * público: ficam em `siga-files`, sob o prefixo da escola, e são lidas por URL
 * assinada de curta duração através de `resolvePersonPhotoUrl`.
 */
export async function uploadPersonPhotoToLibrary(input: {
  file: File;
  personId: string;
  schoolId: string;
  ownerUserId: string;
}): Promise<string> {
  const kind = kindFromFile(input.file.name, input.file.type);
  if (kind !== "png" && kind !== "jpeg") {
    throw new Error("Use uma imagem PNG ou JPEG.");
  }
  if (input.file.size > MAX_PHOTO_BYTES) {
    throw new Error("A imagem deve ter no máximo 4 MB.");
  }

  const id = crypto.randomUUID();
  const storagePath = localStoragePath({
    schoolId: input.schoolId,
    area: "secretaria",
    ownerUserId: input.ownerUserId,
    id,
    name: input.file.name,
  });

  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(storagePath, input.file, { upsert: false, cacheControl: "3600" });
  if (error) throw new Error("Não foi possível carregar a fotografia.");

  await registerSchoolFile({
    data: {
      id,
      name: input.file.name,
      mime: input.file.type || "image/jpeg",
      sizeBytes: input.file.size,
      area: "secretaria",
      visibility: "private",
      storagePath,
      storageBackend: "sga",
      category: "foto",
      relatedPersonId: input.personId,
    },
  });

  const photoUrl = `siga-file://${id}`;
  await setPersonPhotoUrl({ data: { personId: input.personId, photoUrl } });
  return photoUrl;
}

/** Liga uma imagem privada da biblioteca à ficha da pessoa. */
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
  if (input.file.sizeBytes > MAX_PHOTO_BYTES) {
    throw new Error("A imagem deve ter no máximo 4 MB.");
  }
  await setPersonPhotoUrl({
    data: { personId: input.personId, photoUrl: `siga-file://${input.file.id}` },
  });
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
  return `siga-file://${input.file.id}`;
}
