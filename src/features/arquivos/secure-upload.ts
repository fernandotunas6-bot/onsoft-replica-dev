import { saveLocalFile } from "./local-store";
import { registerSchoolFile } from "./server";
import { supabase } from "@/integrations/supabase/client";
import { kindFromFile, type FileArea, type FileKind } from "./kinds";
import type { SchoolFileRecord } from "./schemas";
import { isAllowedSchoolFile } from "./kinds";

const FILES_BUCKET = "siga-files";
const AVATARS_BUCKET = "avatars";

export type SecureUploadOptions = {
  file: File;
  area?: FileArea;
  category?: SchoolFileRecord["category"];
  classGroupId?: string;
  relatedUserId?: string;
  relatedPersonId?: string;
  description?: string;
  isAvatar?: boolean;
  googleDriveUrl?: string;
};

export type SecureUploadResult = {
  ok: boolean;
  record?: SchoolFileRecord;
  localPath?: string;
  signedUrl?: string;
  googleDriveExportUrl?: string;
  error?: string;
};

/**
 * Valida rigorosamente o ficheiro antes do upload.
 */
export function validateFileBeforeUpload(file: File): { ok: boolean; error?: string; kind: FileKind } {
  if (!file) return { ok: false, error: "Nenhum ficheiro fornecido.", kind: "pdf" };

  const kind = kindFromFile(file.name, file.type);
  if (!kind) {
    return {
      ok: false,
      error: `Tipo de ficheiro não suportado (${file.type || file.name}). Envie PDF, Word, Excel, Imagem ou Texto.`,
      kind: "pdf",
    };
  }

  if (!isAllowedSchoolFile(file.name, file.type)) {
    return {
      ok: false,
      error: "O formato ou nome do ficheiro viola as políticas de segurança da escola.",
      kind,
    };
  }

  // Limite de 15MB para documentos e 10MB para imagens
  const maxBytes = kind === "pdf" || kind === "word" || kind === "excel" ? 15 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `O ficheiro tem ${sizeMb} MB, o que excede o limite máximo permitido de ${Math.round(maxBytes / (1024 * 1024))} MB.`,
      kind,
    };
  }

  return { ok: true, kind };
}

/**
 * Otimiza imagens grandes antes do upload.
 */
export async function optimizeImageIfPossible(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type.includes("svg") || file.size <= 1.5 * 1024 * 1024) {
    return file;
  }
  if (typeof window === "undefined" || typeof HTMLCanvasElement === "undefined") {
    return file;
  }

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressed);
          } else {
            resolve(file);
          }
        },
        "image/webp",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * Executa upload seguro com roteamento automático para Supabase Storage privado
 * (siga-files ou avatars), fallback local em modo telemóvel/offline, e link Google Drive opcional.
 */
export async function uploadSecureFile(options: SecureUploadOptions): Promise<SecureUploadResult> {
  const validation = validateFileBeforeUpload(options.file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const optimizedFile = await optimizeImageIfPossible(options.file);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  // Se estiver em modo mobile/offline, grava no armazenamento local do dispositivo sem falhar
  if (isMobile && isOffline) {
    try {
      const fileId = crypto.randomUUID();
      await saveLocalFile({
        id: fileId,
        name: optimizedFile.name,
        mime: optimizedFile.type,
        kind: validation.kind,
        sizeBytes: optimizedFile.size,
        area: options.area ?? "escola",
        visibility: "school",
        storageBackend: "local",
        storagePath: `local://${fileId}`,
        classGroupId: options.classGroupId,
        blob: optimizedFile,
      });

      return {
        ok: true,
        localPath: `local://${fileId}`,
        googleDriveExportUrl: options.googleDriveUrl,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao gravar no armazenamento do dispositivo.",
      };
    }
  }

  // Upload online seguro para Supabase Storage privado
  try {
    const bucket = options.isAvatar ? AVATARS_BUCKET : FILES_BUCKET;
    const fileExt = optimizedFile.name.split(".").pop() || "bin";
    const storagePath = `${options.area ?? "escola"}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, optimizedFile, {
      cacheControl: "3600",
      upsert: true,
    });

    if (uploadError) {
      // Fallback gracioso para armazenamento local do dispositivo em caso de falha de rede
      const fileId = crypto.randomUUID();
      await saveLocalFile({
        id: fileId,
        name: optimizedFile.name,
        mime: optimizedFile.type,
        kind: validation.kind,
        sizeBytes: optimizedFile.size,
        area: options.area ?? "escola",
        visibility: "school",
        storageBackend: "local",
        storagePath: `local://${fileId}`,
        classGroupId: options.classGroupId,
        blob: optimizedFile,
      });

      return {
        ok: true,
        localPath: `local://${fileId}`,
        googleDriveExportUrl: options.googleDriveUrl,
      };
    }

    // Regista o ficheiro no SGA com os metadados de segurança
    const result = await registerSchoolFile({
      data: {
        name: optimizedFile.name,
        mime: optimizedFile.type,
        sizeBytes: optimizedFile.size,
        area: options.area ?? "escola",
        storageBackend: "sga",
        storagePath,
        classGroupId: options.classGroupId,
        category: options.category ?? "outro",
        description: options.description,
        relatedUserId: options.relatedUserId,
        relatedPersonId: options.relatedPersonId,
      },
    });

    return {
      ok: true,
      record: result.record,
      googleDriveExportUrl: options.googleDriveUrl ?? (options.googleDriveUrl ? `https://drive.google.com/` : undefined),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível concluir o upload com segurança.",
    };
  }
}
