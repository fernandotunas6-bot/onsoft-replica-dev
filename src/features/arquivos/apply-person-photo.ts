import { setPersonPhotoUrl } from "@/features/people/server";
import type { SchoolFileRecord } from "./schemas";
import { updateSchoolFileMeta } from "./server";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

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
