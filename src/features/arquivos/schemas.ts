import { z } from "zod";

export const fileAreaOptions = ["escola", "secretaria", "pessoal", "publico"] as const;
export const fileVisibilityOptions = ["private", "school", "public"] as const;
export const fileKindOptions = [
  "folder",
  "pdf",
  "word",
  "excel",
  "powerpoint",
  "csv",
  "png",
  "jpeg",
  "webp",
  "gif",
  "svg",
] as const;
export const fileBackendOptions = ["sga", "local"] as const;
export const fileCategoryOptions = [
  "bilhete",
  "certificado",
  "contrato",
  "fatura",
  "recibo",
  "talao",
  "pauta",
  "comunicado",
  "material_aula",
  "foto",
  "outro",
] as const;
export const fileEventActions = [
  "created",
  "renamed",
  "deleted",
  "opened",
  "downloaded",
  "visibility_changed",
  "linked_class",
  "unlinked_class",
  "metadata_updated",
  "moved",
  "folder_created",
] as const;

export const FILE_MAX_BYTES = 8 * 1024 * 1024;
export const FILE_LIST_LIMIT = 48;

export const allowedFileMimes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
] as const;

export const fileAreaSchema = z.enum(fileAreaOptions);
export const fileVisibilitySchema = z.enum(fileVisibilityOptions);
export const fileKindSchema = z.enum(fileKindOptions);
export const fileCategorySchema = z.enum(fileCategoryOptions);
export const fileEventActionSchema = z.enum(fileEventActions);

export const fileMetaFieldsSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(800).optional().or(z.literal("")),
  category: fileCategorySchema.default("outro"),
  documentDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data AAAA-MM-DD.")
    .optional()
    .or(z.literal("")),
  referenceCode: z.string().trim().max(80).optional().or(z.literal("")),
  relatedUserId: z.string().uuid().optional().nullable(),
  relatedPersonId: z.string().uuid().optional().nullable(),
});
export type FileMetaFields = z.infer<typeof fileMetaFieldsSchema>;

export const listArquivosInputSchema = z.object({
  query: z.string().trim().optional(),
  area: fileAreaSchema.optional(),
  classGroupId: z.string().uuid().optional(),
  relatedUserId: z.string().uuid().optional(),
  relatedPersonId: z.string().uuid().optional(),
  category: fileCategorySchema.optional(),
  /** null = raiz da área; uuid = conteúdo da pasta */
  parentId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(FILE_LIST_LIMIT).default(FILE_LIST_LIMIT),
});
export type ListArquivosInput = z.infer<typeof listArquivosInputSchema>;

export const registerSchoolFileInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  mime: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(FILE_MAX_BYTES),
  area: fileAreaSchema,
  visibility: fileVisibilitySchema,
  storagePath: z.string().trim().min(1).max(400),
  storageBackend: z.enum(fileBackendOptions),
  classGroupId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(800).optional(),
  category: fileCategorySchema.optional(),
  documentDate: z.string().trim().optional(),
  referenceCode: z.string().trim().max(80).optional(),
  relatedUserId: z.string().uuid().optional().nullable(),
  relatedPersonId: z.string().uuid().optional().nullable(),
});
export type RegisterSchoolFileInput = z.infer<typeof registerSchoolFileInputSchema>;

export const createSchoolFolderInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  area: fileAreaSchema,
  parentId: z.string().uuid().optional().nullable(),
  visibility: fileVisibilitySchema.default("private"),
});

export const moveSchoolFilesInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(40),
  parentId: z.string().uuid().nullable(),
  area: fileAreaSchema.optional(),
});

export const listFolderTrailInputSchema = z.object({
  folderId: z.string().uuid().optional().nullable(),
});

export const archiveFinanceDocumentInputSchema = z.object({
  category: z.enum(["recibo", "talao", "fatura"]),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(12).max(800),
  relatedPersonId: z.string().uuid().optional().nullable(),
  sourceLabel: z.string().trim().max(120).optional(),
  documentCode: z.string().trim().max(40).optional(),
  amountLabel: z.string().trim().max(80).optional(),
});
export type ArchiveFinanceDocumentInput = z.infer<typeof archiveFinanceDocumentInputSchema>;

export const schoolFileIdInputSchema = z.object({
  id: z.string().uuid(),
});

export const schoolFileIdsInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(60),
});

export const renameSchoolFileInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
});

export const updateSchoolFileMetaInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(800).optional().nullable(),
  category: fileCategorySchema.optional(),
  documentDate: z.string().trim().optional().nullable(),
  referenceCode: z.string().trim().max(80).optional().nullable(),
  relatedUserId: z.string().uuid().optional().nullable(),
  relatedPersonId: z.string().uuid().optional().nullable(),
  visibility: fileVisibilitySchema.optional(),
  area: fileAreaSchema.optional(),
});

export const linkSchoolFileToClassInputSchema = z.object({
  id: z.string().uuid(),
  classGroupId: z.string().uuid().nullable(),
});

export const setSchoolFileVisibilityInputSchema = z.object({
  id: z.string().uuid(),
  visibility: fileVisibilitySchema,
});

export const logSchoolFileEventInputSchema = z.object({
  id: z.string().uuid(),
  action: fileEventActionSchema,
  detail: z.string().trim().max(240).optional(),
});

export const listSchoolFileActivityInputSchema = z.object({
  id: z.string().uuid(),
  limit: z.number().int().min(1).max(40).default(20),
});

export const listArquivosPeopleInputSchema = z.object({
  query: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(40).default(24),
});

export const listArquivosStudentsInputSchema = z.object({
  query: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(40).default(24),
});

export type SchoolFileRecord = {
  id: string;
  schoolId: string;
  ownerUserId: string;
  name: string;
  mime: string;
  kind: (typeof fileKindOptions)[number];
  sizeBytes: number;
  area: (typeof fileAreaOptions)[number];
  visibility: (typeof fileVisibilityOptions)[number];
  storageBackend: (typeof fileBackendOptions)[number];
  storagePath: string;
  classGroupId: string | null;
  parentId: string | null;
  isFolder: boolean;
  title: string | null;
  description: string | null;
  category: (typeof fileCategoryOptions)[number] | null;
  documentDate: string | null;
  referenceCode: string | null;
  relatedUserId: string | null;
  relatedPersonId: string | null;
  relatedUserName: string | null;
  relatedPersonName: string | null;
  createdAt: string;
  updatedAt: string | null;
  updatedByUserId: string | null;
  lastAction: string | null;
  lastActionAt: string | null;
  lastActionByUserId: string | null;
  ownerName: string | null;
  updatedByName: string | null;
  lastActionByName: string | null;
  ownerAvatarUrl: string | null;
  updatedByAvatarUrl: string | null;
  lastActionByAvatarUrl: string | null;
};

export type SchoolFileEvent = {
  id: string;
  fileId: string;
  action: (typeof fileEventActions)[number];
  detail: string | null;
  actorUserId: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  createdAt: string;
};
