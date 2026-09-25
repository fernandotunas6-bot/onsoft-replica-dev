import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import type { ApplicationRole } from "@/features/auth/access-policy";
import { loadPersonNamesById } from "@/features/people/lookup";
import {
  canAccessFileContent,
  canManageSystemFile,
  canReadFileArea,
  canWriteFileArea,
  kindFromFile,
} from "./kinds";
import { insertFinanceArchive } from "./archive-finance-core";
import { generateDocumentCode, normalizeDocumentCode, prefixForCategory } from "./document-code";
import {
  createSchoolFolderInputSchema,
  archiveFinanceDocumentInputSchema,
  linkSchoolFileToClassInputSchema,
  listArquivosInputSchema,
  listArquivosPeopleInputSchema,
  listArquivosStudentsInputSchema,
  listFolderTrailInputSchema,
  listSchoolFileActivityInputSchema,
  logSchoolFileEventInputSchema,
  moveSchoolFilesInputSchema,
  registerSchoolFileInputSchema,
  renameSchoolFileInputSchema,
  schoolFileIdInputSchema,
  schoolFileIdsInputSchema,
  setSchoolFileVisibilityInputSchema,
  updateSchoolFileMetaInputSchema,
  type SchoolFileEvent,
  type SchoolFileRecord,
} from "./schemas";

const STAFF_ROLES: ApplicationRole[] = ["Administrador", "Secretaria", "Tesouraria", "Professor"];

const MISSING_TABLE = /schema cache|does not exist|42P01|PGRST/i;
const FILES_BUCKET = "siga-files";
const FILE_SELECT =
  "id, school_id, owner_user_id, name, mime, size_bytes, area, visibility, storage_backend, storage_path, class_group_id, parent_id, is_folder, is_system, title, description, category, document_date, reference_code, related_user_id, related_person_id, created_at, updated_at, updated_by, last_action, last_action_at, last_action_by";
const FILE_SELECT_CLASS =
  "id, school_id, owner_user_id, name, mime, size_bytes, area, visibility, storage_backend, storage_path, class_group_id, created_at";
const FILE_SELECT_BASIC =
  "id, school_id, owner_user_id, name, mime, size_bytes, area, visibility, storage_backend, storage_path, created_at";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

function missingFilesTable(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || MISSING_TABLE.test(String(error.message ?? ""));
}

function missingOptionalColumn(error: { message?: string } | null) {
  return Boolean(
    error &&
    /class_group_id|updated_at|updated_by|last_action|title|description|category|document_date|reference_code|related_user|related_person|parent_id|is_folder|is_system|42703|schema cache/i.test(
      String(error.message ?? ""),
    ),
  );
}

function asCategory(value: unknown): SchoolFileRecord["category"] {
  const raw = value ? String(value) : "";
  if (
    raw === "bilhete" ||
    raw === "certificado" ||
    raw === "contrato" ||
    raw === "fatura" ||
    raw === "recibo" ||
    raw === "talao" ||
    raw === "pauta" ||
    raw === "comunicado" ||
    raw === "material_aula" ||
    raw === "foto" ||
    raw === "outro"
  ) {
    return raw;
  }
  return null;
}

function mapRow(row: Record<string, unknown>): SchoolFileRecord {
  const name = String(row["name"] ?? "ficheiro");
  const mime = String(row["mime"] ?? "application/octet-stream");
  const isFolder = Boolean(row["is_folder"]);
  return {
    id: String(row["id"]),
    schoolId: String(row["school_id"]),
    ownerUserId: String(row["owner_user_id"]),
    name,
    mime,
    kind: isFolder
      ? "folder"
      : (kindFromFile(name, mime) ??
        (mime.toLowerCase().startsWith("image/")
          ? "png"
          : mime.toLowerCase().startsWith("text/")
            ? "word"
            : "pdf")),
    sizeBytes: Number(row["size_bytes"] ?? 0),
    area: row["area"] as SchoolFileRecord["area"],
    visibility: row["visibility"] as SchoolFileRecord["visibility"],
    storageBackend: (row["storage_backend"] as SchoolFileRecord["storageBackend"]) ?? "sga",
    storagePath: String(row["storage_path"] ?? ""),
    classGroupId: row["class_group_id"] ? String(row["class_group_id"]) : null,
    parentId: row["parent_id"] ? String(row["parent_id"]) : null,
    isFolder,
    title: row["title"] ? String(row["title"]) : null,
    description: row["description"] ? String(row["description"]) : null,
    category: asCategory(row["category"]),
    documentDate: row["document_date"] ? String(row["document_date"]).slice(0, 10) : null,
    referenceCode: row["reference_code"] ? String(row["reference_code"]) : null,
    relatedUserId: row["related_user_id"] ? String(row["related_user_id"]) : null,
    relatedPersonId: row["related_person_id"] ? String(row["related_person_id"]) : null,
    relatedUserName: null,
    relatedPersonName: null,
    isSystem: Boolean(row["is_system"]),
    createdAt: String(row["created_at"] ?? new Date().toISOString()),
    updatedAt: row["updated_at"] ? String(row["updated_at"]) : null,
    updatedByUserId: row["updated_by"] ? String(row["updated_by"]) : null,
    lastAction: row["last_action"] ? String(row["last_action"]) : null,
    lastActionAt: row["last_action_at"] ? String(row["last_action_at"]) : null,
    lastActionByUserId: row["last_action_by"] ? String(row["last_action_by"]) : null,
    ownerName: null,
    updatedByName: null,
    lastActionByName: null,
    ownerAvatarUrl: null,
    updatedByAvatarUrl: null,
    lastActionByAvatarUrl: null,
  };
}

function canSeeRow(row: SchoolFileRecord, userId: string, role: string) {
  if (!canReadFileArea(role, row.area)) return false;
  if (row.area === "pessoal" && row.ownerUserId !== userId) return false;
  if (row.visibility === "private" && row.ownerUserId !== userId) {
    return role === "Administrador" || (row.area === "secretaria" && role === "Secretaria");
  }
  return true;
}

/** Metadados visíveis; descrição/caminho de sistema ocultos sem permissão de conteúdo. */
function presentFileForViewer(
  file: SchoolFileRecord,
  userId: string,
  role: string,
): SchoolFileRecord {
  if (canAccessFileContent(file, userId, role)) return file;
  return {
    ...file,
    description: null,
    storagePath: "",
  };
}

async function profilePeople(db: AdminDb, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, { name: string | null; avatarUrl: string | null }>();
  const { data } = await db.from("profiles").select("id, full_name, avatar_url").in("id", unique);
  const map = new Map<string, { name: string | null; avatarUrl: string | null }>();
  for (const row of data ?? []) {
    if (!row.id) continue;
    map.set(String(row.id), {
      name: row.full_name ? String(row.full_name) : null,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    });
  }
  return map;
}

function enrichPeople(
  files: SchoolFileRecord[],
  people: Map<string, { name: string | null; avatarUrl: string | null }>,
) {
  return files.map((file) => {
    const owner = people.get(file.ownerUserId);
    const updated = file.updatedByUserId ? people.get(file.updatedByUserId) : undefined;
    const last = file.lastActionByUserId ? people.get(file.lastActionByUserId) : undefined;
    return {
      ...file,
      ownerName: owner?.name ?? file.ownerName,
      ownerAvatarUrl: owner?.avatarUrl ?? file.ownerAvatarUrl,
      updatedByName: updated?.name ?? file.updatedByName,
      updatedByAvatarUrl: updated?.avatarUrl ?? file.updatedByAvatarUrl,
      lastActionByName: last?.name ?? file.lastActionByName,
      lastActionByAvatarUrl: last?.avatarUrl ?? file.lastActionByAvatarUrl,
    };
  });
}

async function recordFileEvent(
  db: AdminDb,
  input: {
    schoolId: string;
    fileId: string;
    actorUserId: string;
    action: string;
    detail?: string | undefined;
  },
) {
  const now = new Date().toISOString();
  await db.from("siga_file_events").insert({
    school_id: input.schoolId,
    file_id: input.fileId,
    actor_user_id: input.actorUserId,
    action: input.action,
    detail: input.detail ?? null,
  });
  await db
    .from("siga_files")
    .update({
      last_action: input.action,
      last_action_at: now,
      last_action_by: input.actorUserId,
      updated_at: now,
      updated_by: input.actorUserId,
    })
    .eq("id", input.fileId)
    .eq("school_id", input.schoolId);
}

export const getFilesWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    return {
      schoolId: membership.schoolId,
      userId,
      role: membership.appRole,
      tableHint: "Corra supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql no SQL Editor.",
    };
  });

export const listArquivosClassOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("class_groups")
      .select("id, name, code")
      .eq("school_id", membership.schoolId)
      .order("name", { ascending: true })
      .limit(80);
    if (error) {
      if (
        missingFilesTable(error) ||
        /42P01|schema cache|does not exist/i.test(String(error.message))
      ) {
        return { classes: [] as Array<{ id: string; name: string; code: string | null }> };
      }
      throw publicDatabaseError(error, "Não foi possível listar as turmas.");
    }
    return {
      classes: (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? "Turma"),
        code: row.code ? String(row.code) : null,
      })),
    };
  });

export const listSchoolFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listArquivosInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    if (data.area && !canReadFileArea(membership.appRole, data.area)) {
      throw new Error("Sem permissão para esta área de arquivos.");
    }
    const db = await loadSgaAdminClient();
    const run = async (select: string, withClass: boolean) => {
      let query = db
        .from("siga_files")
        .select(select)
        .eq("school_id", membership.schoolId)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.area) query = query.eq("area", data.area);
      if (data.query) {
        const q = data.query.replace(/[%(),]/g, " ").trim();
        if (q) {
          query = query.or(
            `name.ilike.%${q}%,title.ilike.%${q}%,reference_code.ilike.%${q}%,description.ilike.%${q}%`,
          );
        }
      }
      if (withClass && data.classGroupId) query = query.eq("class_group_id", data.classGroupId);
      if (withClass && data.relatedUserId) query = query.eq("related_user_id", data.relatedUserId);
      if (withClass && data.relatedPersonId) {
        query = query.eq("related_person_id", data.relatedPersonId);
      }
      if (withClass && data.category) query = query.eq("category", data.category);
      // Pesquisa por ID/texto atravessa pastas; sem query, respeita pasta actual.
      if (!data.query) {
        if (withClass && data.parentId === null) query = query.is("parent_id", null);
        if (withClass && data.parentId) query = query.eq("parent_id", data.parentId);
      }
      return query;
    };
    let { data: rows, error } = await run(FILE_SELECT, true);
    if (error && missingOptionalColumn(error)) {
      ({ data: rows, error } = await run(FILE_SELECT_CLASS, true));
    }
    if (error && missingOptionalColumn(error)) {
      ({ data: rows, error } = await run(FILE_SELECT_BASIC, false));
    }
    if (error) {
      if (missingFilesTable(error)) {
        return {
          files: [] as SchoolFileRecord[],
          schoolId: membership.schoolId,
          backend: "local" as const,
        };
      }
      throw publicDatabaseError(error, "Não foi possível listar os arquivos.");
    }
    let files = (rows ?? [])
      .map((row) => mapRow(row as unknown as Record<string, unknown>))
      .filter((row) => canSeeRow(row, userId, membership.appRole));
    if (data.classGroupId) {
      files = files.filter((row) => row.classGroupId === data.classGroupId);
    }
    if (data.relatedUserId) {
      files = files.filter((row) => row.relatedUserId === data.relatedUserId);
    }
    if (data.relatedPersonId) {
      files = files.filter((row) => row.relatedPersonId === data.relatedPersonId);
    }
    if (data.category) {
      files = files.filter((row) => row.category === data.category);
    }
    if (data.parentId === null && !data.query) {
      files = files.filter((row) => !row.parentId);
    } else if (data.parentId && !data.query) {
      files = files.filter((row) => row.parentId === data.parentId);
    }
    if (data.query) {
      const needle = data.query.toLowerCase();
      files = files.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          (row.title ?? "").toLowerCase().includes(needle) ||
          (row.description ?? "").toLowerCase().includes(needle) ||
          (row.referenceCode ?? "").toLowerCase().includes(needle),
      );
    }
    const people = await profilePeople(
      db,
      files.flatMap(
        (file) =>
          [
            file.ownerUserId,
            file.updatedByUserId,
            file.lastActionByUserId,
            file.relatedUserId,
          ].filter(Boolean) as string[],
      ),
    );
    const personIds = [
      ...new Set(files.map((file) => file.relatedPersonId).filter(Boolean) as string[]),
    ];
    const personNames = await loadPersonNamesById(db, membership.schoolId, personIds);
    return {
      files: enrichPeople(files, people).map((file) => {
        const withNames = {
          ...file,
          relatedUserName: file.relatedUserId
            ? (people.get(file.relatedUserId)?.name ?? file.relatedUserName)
            : null,
          relatedPersonName: file.relatedPersonId
            ? (personNames.get(file.relatedPersonId) ?? file.relatedPersonName)
            : null,
        };
        return presentFileForViewer(withNames, userId, membership.appRole);
      }),
      schoolId: membership.schoolId,
      backend: "sga" as const,
    };
  });

export const registerSchoolFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => registerSchoolFileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, STAFF_ROLES);
    if (!canWriteFileArea(membership.appRole, data.area)) {
      throw new Error("Sem permissão para gravar nesta área.");
    }
    if (!kindFromFile(data.name, data.mime)) {
      throw new Error("Formato fora do padrão SIGA.");
    }
    const db = await loadSgaAdminClient();
    const now = new Date().toISOString();
    const base = {
      id: data.id,
      school_id: membership.schoolId,
      owner_user_id: userId,
      name: data.name,
      mime: data.mime,
      size_bytes: data.sizeBytes,
      area: data.area,
      visibility: data.visibility,
      storage_backend: data.storageBackend,
      storage_path: data.storagePath,
      created_by: userId,
    };
    const title = data.title?.trim() || data.name;
    const category = data.category ?? "outro";
    const referenceCode =
      (data.referenceCode?.trim() && normalizeDocumentCode(data.referenceCode)) ||
      generateDocumentCode(prefixForCategory(category));
    const withAudit = {
      ...base,
      class_group_id: data.classGroupId ?? null,
      parent_id: data.parentId ?? null,
      is_folder: false,
      title,
      description: data.description?.trim() || null,
      category,
      document_date: data.documentDate?.trim() || null,
      reference_code: referenceCode,
      related_user_id: data.relatedUserId?.trim() || userId,
      related_person_id: data.relatedPersonId ?? null,
      is_system: false,
      updated_at: now,
      updated_by: userId,
      last_action: "created",
      last_action_at: now,
      last_action_by: userId,
    };
    let row: Record<string, unknown> | null = null;
    const first = await db.from("siga_files").insert(withAudit).select(FILE_SELECT).single();
    if (first.error && missingOptionalColumn(first.error)) {
      const mid = await db
        .from("siga_files")
        .insert({ ...base, class_group_id: data.classGroupId ?? null })
        .select(FILE_SELECT_CLASS)
        .single();
      if (mid.error && missingOptionalColumn(mid.error)) {
        const fallback = await db
          .from("siga_files")
          .insert(base)
          .select(FILE_SELECT_BASIC)
          .single();
        if (fallback.error) {
          if (missingFilesTable(fallback.error)) return { storage: "local" as const, record: null };
          throw publicDatabaseError(fallback.error, "Não foi possível registar o ficheiro.");
        }
        row = fallback.data as Record<string, unknown>;
      } else if (mid.error) {
        if (missingFilesTable(mid.error)) return { storage: "local" as const, record: null };
        throw publicDatabaseError(mid.error, "Não foi possível registar o ficheiro.");
      } else {
        row = mid.data as Record<string, unknown>;
      }
    } else if (first.error) {
      if (missingFilesTable(first.error)) return { storage: "local" as const, record: null };
      throw publicDatabaseError(first.error, "Não foi possível registar o ficheiro.");
    } else {
      row = first.data as Record<string, unknown>;
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action: "created",
        detail: data.name,
      });
    } catch {
      /* tabela de eventos opcional */
    }
    return { storage: "sga" as const, record: mapRow(row) };
  });

export const createSchoolFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSchoolFolderInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, STAFF_ROLES);
    if (!canWriteFileArea(membership.appRole, data.area)) {
      throw new Error("Sem permissão para criar pastas nesta área.");
    }
    const db = await loadSgaAdminClient();
    const now = new Date().toISOString();
    const payload = {
      id: data.id,
      school_id: membership.schoolId,
      owner_user_id: userId,
      name: data.name,
      mime: "application/vnd.siga.folder",
      size_bytes: 1,
      area: data.area,
      visibility: data.visibility,
      storage_backend: "sga" as const,
      storage_path: `folder/${data.id}`,
      class_group_id: null as string | null,
      parent_id: data.parentId ?? null,
      is_folder: true,
      title: data.name,
      description: "Pasta da biblioteca SIGA",
      category: "outro" as const,
      related_user_id: userId,
      is_system: false,
      created_by: userId,
      updated_at: now,
      updated_by: userId,
      last_action: "folder_created",
      last_action_at: now,
      last_action_by: userId,
    };
    const { data: inserted, error } = await db
      .from("siga_files")
      .insert(payload)
      .select(FILE_SELECT)
      .single();
    if (error) {
      if (missingFilesTable(error) || missingOptionalColumn(error)) {
        return {
          storage: "local" as const,
          record: mapRow({
            ...payload,
            created_at: now,
          }),
        };
      }
      throw publicDatabaseError(error, "Não foi possível criar a pasta.");
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action: "folder_created",
        detail: data.name,
      });
    } catch {
      /* opcional */
    }
    return { storage: "sga" as const, record: mapRow(inserted as Record<string, unknown>) };
  });

export const moveSchoolFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => moveSchoolFilesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, STAFF_ROLES);
    if (data.area && !canWriteFileArea(membership.appRole, data.area)) {
      throw new Error("Sem permissão para mover para essa área.");
    }
    if (data.parentId && data.ids.includes(data.parentId)) {
      throw new Error("Não é possível mover uma pasta para dentro de si própria.");
    }
    const db = await loadSgaAdminClient();
    const { data: rows, error: loadError } = await db
      .from("siga_files")
      .select("id, owner_user_id, area, is_folder, is_system")
      .eq("school_id", membership.schoolId)
      .in("id", data.ids);
    if (loadError) {
      if (missingFilesTable(loadError) || missingOptionalColumn(loadError)) {
        return { ok: true, localOnly: true, moved: 0 };
      }
      throw publicDatabaseError(loadError, "Não foi possível mover.");
    }
    const items = rows ?? [];
    if (!items.length) throw new Error("Nenhum item seleccionado.");
    for (const item of items) {
      const area = item.area as SchoolFileRecord["area"];
      const owner = String(item.owner_user_id);
      if (
        !canManageSystemFile(
          { isSystem: Boolean(item.is_system), ownerUserId: owner },
          userId,
          membership.appRole,
        )
      ) {
        throw new Error("Há ficheiros do sistema protegidos na selecção.");
      }
      const canEdit =
        owner === userId ||
        membership.appRole === "Administrador" ||
        (area === "secretaria" && membership.appRole === "Secretaria");
      if (!canEdit || !canWriteFileArea(membership.appRole, area)) {
        throw new Error("Sem permissão para mover um dos itens seleccionados.");
      }
    }
    if (data.parentId) {
      const { data: parent, error: parentError } = await db
        .from("siga_files")
        .select("id, is_folder, area")
        .eq("id", data.parentId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (parentError && !missingOptionalColumn(parentError)) {
        throw publicDatabaseError(parentError, "Não foi possível validar a pasta de destino.");
      }
      if (!parent || !parent.is_folder) {
        throw new Error("O destino tem de ser uma pasta.");
      }
      if (data.area && String(parent.area) !== data.area) {
        throw new Error("A pasta de destino pertence a outra área.");
      }
    }
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      parent_id: data.parentId,
      updated_at: now,
      updated_by: userId,
      last_action: "moved",
      last_action_at: now,
      last_action_by: userId,
    };
    if (data.area) payload["area"] = data.area;
    const { error } = await db
      .from("siga_files")
      .update(payload)
      .eq("school_id", membership.schoolId)
      .in("id", data.ids);
    if (error) {
      if (missingOptionalColumn(error) || missingFilesTable(error)) {
        return { ok: true, localOnly: true, moved: 0 };
      }
      throw publicDatabaseError(error, "Não foi possível mover os itens.");
    }
    for (const id of data.ids) {
      try {
        await recordFileEvent(db, {
          schoolId: membership.schoolId,
          fileId: id,
          actorUserId: userId,
          action: "moved",
          detail: data.parentId ? `pasta ${data.parentId}` : "raiz",
        });
      } catch {
        /* opcional */
      }
    }
    return { ok: true, localOnly: false, moved: data.ids.length };
  });

export const listFolderTrail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listFolderTrailInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    if (!data.folderId) return { trail: [] as Array<{ id: string; name: string }> };
    const db = await loadSgaAdminClient();
    const trail: Array<{ id: string; name: string }> = [];
    let currentId: string | null = data.folderId;
    for (let depth = 0; depth < 12 && currentId; depth += 1) {
      const { data: row, error } = (await db
        .from("siga_files")
        .select("id, name, parent_id, is_folder")
        .eq("id", currentId)
        .eq("school_id", membership.schoolId)
        .maybeSingle()) as {
        data: { id: unknown; name: unknown; parent_id: unknown; is_folder: unknown } | null;
        error: { message?: string; code?: string } | null;
      };
      if (error) {
        if (missingFilesTable(error) || missingOptionalColumn(error)) return { trail: [] };
        throw publicDatabaseError(error, "Não foi possível ler o caminho da pasta.");
      }
      if (!row || !row.is_folder) break;
      trail.unshift({ id: String(row.id), name: String(row.name) });
      currentId = row.parent_id ? String(row.parent_id) : null;
    }
    return { trail };
  });

export const archiveFinanceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => archiveFinanceDocumentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
    ]);
    const area: SchoolFileRecord["area"] = canWriteFileArea(membership.appRole, "secretaria")
      ? "secretaria"
      : "escola";
    if (!canWriteFileArea(membership.appRole, area)) {
      throw new Error("Sem permissão para arquivar documentos financeiros.");
    }
    const db = await loadSgaAdminClient();
    try {
      const archived = await insertFinanceArchive(db, {
        schoolId: membership.schoolId,
        userId,
        area,
        category: data.category,
        title: data.title,
        description: data.description,
        relatedPersonId: data.relatedPersonId,
        sourceLabel: data.sourceLabel,
        amountLabel: data.amountLabel,
        documentCode: data.documentCode,
      });
      if (!archived.reused) {
        try {
          await recordFileEvent(db, {
            schoolId: membership.schoolId,
            fileId: archived.fileId,
            actorUserId: userId,
            action: "created",
            detail: archived.documentCode,
          });
        } catch {
          /* opcional */
        }
      }
      return { ok: true as const, ...archived };
    } catch (error) {
      throw publicDatabaseError(
        error as { message?: string },
        "Não foi possível arquivar o documento financeiro.",
      );
    }
  });

export const renameSchoolFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => renameSchoolFileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data: existing, error: loadError } = await db
      .from("siga_files")
      .select("id, owner_user_id, area, is_system")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (loadError) {
      if (missingFilesTable(loadError)) return { ok: true, localOnly: true };
      throw publicDatabaseError(loadError, "Não foi possível renomear o ficheiro.");
    }
    if (!existing) throw new Error("Ficheiro não encontrado.");
    const area = existing.area as SchoolFileRecord["area"];
    const owner = String(existing.owner_user_id);
    if (
      !canManageSystemFile(
        { isSystem: Boolean(existing.is_system), ownerUserId: owner },
        userId,
        membership.appRole,
      )
    ) {
      throw new Error("Ficheiro do sistema protegido — sem permissão para alterar.");
    }
    const canEdit =
      owner === userId ||
      membership.appRole === "Administrador" ||
      (area === "secretaria" && membership.appRole === "Secretaria");
    if (!canEdit || !canWriteFileArea(membership.appRole, area)) {
      throw new Error("Sem permissão para renomear este ficheiro.");
    }
    const now = new Date().toISOString();
    const { error } = await db
      .from("siga_files")
      .update({
        name: data.name,
        updated_at: now,
        updated_by: userId,
        last_action: "renamed",
        last_action_at: now,
        last_action_by: userId,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId);
    if (error && missingOptionalColumn(error)) {
      const plain = await db
        .from("siga_files")
        .update({ name: data.name })
        .eq("id", data.id)
        .eq("school_id", membership.schoolId);
      if (plain.error)
        throw publicDatabaseError(plain.error, "Não foi possível renomear o ficheiro.");
    } else if (error) {
      throw publicDatabaseError(error, "Não foi possível renomear o ficheiro.");
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action: "renamed",
        detail: data.name,
      });
    } catch {
      /* opcional */
    }
    return { ok: true, localOnly: false };
  });

export const updateSchoolFileMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchoolFileMetaInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data: existing, error: loadError } = await db
      .from("siga_files")
      .select("id, owner_user_id, area, is_system")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (loadError) {
      if (missingFilesTable(loadError)) return { ok: true, localOnly: true };
      throw publicDatabaseError(loadError, "Não foi possível actualizar os metadados.");
    }
    if (!existing) throw new Error("Ficheiro não encontrado.");
    const area = existing.area as SchoolFileRecord["area"];
    const owner = String(existing.owner_user_id);
    if (
      !canManageSystemFile(
        { isSystem: Boolean(existing.is_system), ownerUserId: owner },
        userId,
        membership.appRole,
      )
    ) {
      throw new Error("Ficheiro do sistema protegido — sem permissão para alterar.");
    }
    const canEdit =
      owner === userId ||
      membership.appRole === "Administrador" ||
      (area === "secretaria" && membership.appRole === "Secretaria");
    if (!canEdit || !canWriteFileArea(membership.appRole, area)) {
      throw new Error("Sem permissão para editar metadados.");
    }
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      updated_at: now,
      updated_by: userId,
      last_action: "metadata_updated",
      last_action_at: now,
      last_action_by: userId,
    };
    if (data.title !== undefined) payload["title"] = data.title;
    if (data.description !== undefined) payload["description"] = data.description || null;
    if (data.category !== undefined) payload["category"] = data.category;
    if (data.documentDate !== undefined) payload["document_date"] = data.documentDate || null;
    if (data.referenceCode !== undefined) payload["reference_code"] = data.referenceCode || null;
    if (data.relatedUserId !== undefined) {
      payload["related_user_id"] = data.relatedUserId?.trim() || owner;
    }
    if (data.relatedPersonId !== undefined) payload["related_person_id"] = data.relatedPersonId;
    if (data.visibility !== undefined) payload["visibility"] = data.visibility;
    if (data.area !== undefined) {
      if (!canWriteFileArea(membership.appRole, data.area)) {
        throw new Error("Sem permissão para mover para essa área.");
      }
      payload["area"] = data.area;
    }
    const { error } = await db
      .from("siga_files")
      .update(payload)
      .eq("id", data.id)
      .eq("school_id", membership.schoolId);
    if (error) {
      if (missingOptionalColumn(error) || missingFilesTable(error)) {
        return { ok: true, localOnly: true };
      }
      throw publicDatabaseError(error, "Não foi possível actualizar os metadados.");
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action: "metadata_updated",
        detail: data.title ?? undefined,
      });
    } catch {
      /* opcional */
    }
    return { ok: true, localOnly: false };
  });

export const listArquivosUserOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data: memberships } = await db
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", membership.schoolId)
      .limit(120);
    const userIds = [
      ...new Set((memberships ?? []).map((row) => String(row.user_id)).filter(Boolean)),
    ];
    if (!userIds.length) {
      return {
        users: [] as Array<{
          id: string;
          name: string;
          cargo: string | null;
          avatarUrl: string | null;
        }>,
      };
    }
    const people = await profilePeople(db, userIds);
    return {
      users: userIds
        .map((id) => ({
          id,
          name: people.get(id)?.name ?? "Utilizador",
          cargo: null as string | null,
          avatarUrl: people.get(id)?.avatarUrl ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    };
  });

export const listArquivosPersonOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listArquivosPeopleInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    let query = db
      .from("people")
      .select("id, full_name, email")
      .eq("school_id", membership.schoolId)
      .order("full_name", { ascending: true })
      .limit(data.limit);
    if (data.query) query = query.ilike("full_name", `%${data.query}%`);
    const { data: rows, error } = await query;
    if (error) {
      if (missingFilesTable(error)) {
        return { people: [] as Array<{ id: string; name: string; email: string | null }> };
      }
      throw publicDatabaseError(error, "Não foi possível listar pessoas.");
    }
    return {
      people: (rows ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.full_name ?? "Pessoa"),
        email: row.email ? String(row.email) : null,
      })),
    };
  });

export const listArquivosStudentOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listArquivosStudentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data: students, error } = await db
      .from("students")
      .select("id, student_number, person_id, status")
      .eq("school_id", membership.schoolId)
      .order("student_number", { ascending: true })
      .limit(Math.min(data.limit * 3, 120));
    if (error) {
      throw publicDatabaseError(error, "Não foi possível listar alunos.");
    }
    const rows = students ?? [];
    const personIds = [...new Set(rows.map((row) => String(row.person_id)).filter(Boolean))];
    if (!personIds.length) {
      return {
        students: [] as Array<{
          personId: string;
          studentId: string;
          name: string;
          registrationNumber: string;
          status: string | null;
        }>,
      };
    }
    const { data: people, error: peopleError } = await db
      .from("people")
      .select("id, full_name")
      .in("id", personIds);
    if (peopleError) {
      throw publicDatabaseError(peopleError, "Não foi possível listar alunos.");
    }
    const peopleById = new Map(
      (people ?? []).map((person) => [String(person.id), String(person.full_name ?? "Aluno")]),
    );
    const needle = data.query?.trim().toLowerCase() ?? "";
    const matched = rows
      .map((row) => {
        const personId = String(row.person_id);
        const name = peopleById.get(personId);
        if (!name) return null;
        const registrationNumber = String(row.student_number ?? "");
        if (
          needle &&
          !name.toLowerCase().includes(needle) &&
          !registrationNumber.toLowerCase().includes(needle)
        ) {
          return null;
        }
        return {
          personId,
          studentId: String(row.id),
          name,
          registrationNumber,
          status: row.status ? String(row.status) : null,
        };
      })
      .filter(Boolean) as Array<{
      personId: string;
      studentId: string;
      name: string;
      registrationNumber: string;
      status: string | null;
    }>;
    matched.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    return { students: matched.slice(0, data.limit) };
  });

export const setSchoolFileVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setSchoolFileVisibilityInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, [
      "Administrador",
      "Secretaria",
      "Professor",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: existing, error: loadError } = await db
      .from("siga_files")
      .select("id, owner_user_id, area, is_system")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (loadError) {
      if (missingFilesTable(loadError)) return { ok: true, localOnly: true };
      throw publicDatabaseError(loadError, "Não foi possível alterar o acesso.");
    }
    if (!existing) throw new Error("Ficheiro não encontrado.");
    const area = existing.area as SchoolFileRecord["area"];
    const owner = String(existing.owner_user_id);
    if (
      !canManageSystemFile(
        { isSystem: Boolean(existing.is_system), ownerUserId: owner },
        userId,
        membership.appRole,
      )
    ) {
      throw new Error("Ficheiro do sistema protegido — sem permissão para alterar.");
    }
    const canEdit =
      owner === userId ||
      membership.appRole === "Administrador" ||
      (area === "secretaria" && membership.appRole === "Secretaria");
    if (!canEdit || !canWriteFileArea(membership.appRole, area)) {
      throw new Error("Sem permissão para alterar o nível de acesso.");
    }
    const now = new Date().toISOString();
    const { error } = await db
      .from("siga_files")
      .update({
        visibility: data.visibility,
        updated_at: now,
        updated_by: userId,
        last_action: "visibility_changed",
        last_action_at: now,
        last_action_by: userId,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId);
    if (error && missingOptionalColumn(error)) {
      const plain = await db
        .from("siga_files")
        .update({ visibility: data.visibility })
        .eq("id", data.id)
        .eq("school_id", membership.schoolId);
      if (plain.error) throw publicDatabaseError(plain.error, "Não foi possível alterar o acesso.");
    } else if (error) {
      throw publicDatabaseError(error, "Não foi possível alterar o acesso.");
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action: "visibility_changed",
        detail: data.visibility,
      });
    } catch {
      /* opcional */
    }
    return { ok: true, localOnly: false };
  });

export const linkSchoolFileToClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkSchoolFileToClassInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const action = data.classGroupId ? "linked_class" : "unlinked_class";
    const now = new Date().toISOString();
    const { error } = await db
      .from("siga_files")
      .update({
        class_group_id: data.classGroupId,
        updated_at: now,
        updated_by: userId,
        last_action: action,
        last_action_at: now,
        last_action_by: userId,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId);
    if (error) {
      if (missingFilesTable(error) || missingOptionalColumn(error)) {
        const plain = await db
          .from("siga_files")
          .update({ class_group_id: data.classGroupId })
          .eq("id", data.id)
          .eq("school_id", membership.schoolId);
        if (plain.error && (missingFilesTable(plain.error) || missingOptionalColumn(plain.error))) {
          return { ok: true, localOnly: true };
        }
        if (plain.error) {
          throw publicDatabaseError(plain.error, "Não foi possível ligar o ficheiro à turma.");
        }
      } else {
        throw publicDatabaseError(error, "Não foi possível ligar o ficheiro à turma.");
      }
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action,
        detail: data.classGroupId ?? undefined,
      });
    } catch {
      /* opcional */
    }
    return { ok: true, localOnly: false };
  });

export const deleteSchoolFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolFileIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data: row, error } = await db
      .from("siga_files")
      .select("id, owner_user_id, area, storage_path, storage_backend, is_system")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error) {
      if (missingFilesTable(error)) return { ok: true, localOnly: true };
      throw publicDatabaseError(error, "Não foi possível apagar o ficheiro.");
    }
    if (!row) throw new Error("Ficheiro não encontrado.");
    const area = row.area as SchoolFileRecord["area"];
    const owner = String(row.owner_user_id);
    if (
      !canManageSystemFile(
        { isSystem: Boolean(row.is_system), ownerUserId: owner },
        userId,
        membership.appRole,
      )
    ) {
      throw new Error("Ficheiro do sistema protegido — sem permissão para apagar.");
    }
    const canDelete =
      owner === userId ||
      membership.appRole === "Administrador" ||
      (area === "secretaria" && membership.appRole === "Secretaria");
    if (!canDelete || !canWriteFileArea(membership.appRole, area)) {
      throw new Error("Sem permissão para apagar este ficheiro.");
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action: "deleted",
      });
    } catch {
      /* opcional */
    }
    if (row.storage_backend === "sga" && row.storage_path) {
      await db.storage.from(FILES_BUCKET).remove([String(row.storage_path)]);
    }
    const { error: delError } = await db
      .from("siga_files")
      .delete()
      .eq("id", data.id)
      .eq("school_id", membership.schoolId);
    if (delError) throw publicDatabaseError(delError, "Não foi possível apagar o ficheiro.");
    return { ok: true, localOnly: false };
  });

export const logSchoolFileEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => logSchoolFileEventInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterForWrite("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data: row, error } = await db
      .from("siga_files")
      .select("id, owner_user_id, area, visibility")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error) {
      if (missingFilesTable(error)) return { ok: true, localOnly: true };
      throw publicDatabaseError(error, "Não foi possível registar a actividade.");
    }
    if (!row) throw new Error("Ficheiro não encontrado.");
    const mapped = mapRow(row as Record<string, unknown>);
    if (!canSeeRow(mapped, userId, membership.appRole)) {
      throw new Error("Sem permissão.");
    }
    try {
      await recordFileEvent(db, {
        schoolId: membership.schoolId,
        fileId: data.id,
        actorUserId: userId,
        action: data.action,
        detail: data.detail,
      });
    } catch {
      return { ok: true, localOnly: true };
    }
    return { ok: true, localOnly: false };
  });

export const listSchoolFileActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listSchoolFileActivityInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    const { data: file, error: fileError } = await db
      .from("siga_files")
      .select("id, owner_user_id, area, visibility, name, created_at")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (fileError) {
      if (missingFilesTable(fileError)) return { events: [] as SchoolFileEvent[] };
      throw publicDatabaseError(fileError, "Não foi possível carregar a auditoria.");
    }
    if (!file) throw new Error("Ficheiro não encontrado.");
    if (!canSeeRow(mapRow(file as Record<string, unknown>), userId, membership.appRole)) {
      throw new Error("Sem permissão.");
    }
    const { data: rows, error } = await db
      .from("siga_file_events")
      .select("id, file_id, actor_user_id, action, detail, created_at")
      .eq("school_id", membership.schoolId)
      .eq("file_id", data.id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      if (missingFilesTable(error) || missingOptionalColumn(error)) {
        return { events: [] as SchoolFileEvent[] };
      }
      throw publicDatabaseError(error, "Não foi possível carregar a auditoria.");
    }
    const eventsRaw = (rows ?? []).map((row) => ({
      id: String(row.id),
      fileId: String(row.file_id),
      action: row.action as SchoolFileEvent["action"],
      detail: row.detail ? String(row.detail) : null,
      actorUserId: String(row.actor_user_id),
      actorName: null as string | null,
      actorAvatarUrl: null as string | null,
      createdAt: String(row.created_at),
    }));
    const people = await profilePeople(
      db,
      eventsRaw.map((event) => event.actorUserId),
    );
    return {
      events: eventsRaw.map((event) => {
        const person = people.get(event.actorUserId);
        return {
          ...event,
          actorName: person?.name ?? null,
          actorAvatarUrl: person?.avatarUrl ?? null,
        };
      }),
    };
  });

export const signSchoolFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolFileIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    let { data: row, error } = await db
      .from("siga_files")
      .select(FILE_SELECT)
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error && missingOptionalColumn(error)) {
      ({ data: row, error } = await db
        .from("siga_files")
        .select(FILE_SELECT_BASIC)
        .eq("id", data.id)
        .eq("school_id", membership.schoolId)
        .maybeSingle());
    }
    if (error) {
      if (missingFilesTable(error)) return { local: true as const, url: null };
      throw publicDatabaseError(error, "Não foi possível abrir o ficheiro.");
    }
    if (!row) throw new Error("Ficheiro não encontrado.");
    const mapped = mapRow(row as Record<string, unknown>);
    if (!canSeeRow(mapped, userId, membership.appRole)) {
      throw new Error("Sem permissão para abrir este ficheiro.");
    }
    if (!canAccessFileContent(mapped, userId, membership.appRole)) {
      try {
        await recordFileEvent(db, {
          schoolId: membership.schoolId,
          fileId: mapped.id,
          actorUserId: userId,
          action: "access_denied",
          detail: "conteúdo de sistema",
        });
      } catch {
        /* auditoria opcional */
      }
      throw new Error("Ficheiro do sistema — conteúdo oculto. Sem permissão de abertura.");
    }
    if (mapped.storageBackend !== "sga") return { local: true as const, url: null };
    const signed = await db.storage.from(FILES_BUCKET).createSignedUrl(mapped.storagePath, 600);
    if (signed.error || !signed.data?.signedUrl) {
      return { local: false as const, url: null };
    }
    return { local: false as const, url: signed.data.signedUrl };
  });

/**
 * Assina várias miniaturas numa só chamada de Storage — a grelha de arquivos
 * chamava signSchoolFile individualmente por cada capa de imagem visível (até 48
 * pedidos em paralelo por pasta), sobrecarregando a ligação sem necessidade.
 */
export const signSchoolFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolFileIdsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { supabase, userId } = context;
    const membership = await requireSgaWriterFor("arquivos", supabase, userId, STAFF_ROLES);
    const db = await loadSgaAdminClient();
    let rows: Array<Record<string, unknown>> | null = null;
    let error: { code?: string; message?: string } | null = null;
    ({ data: rows, error } = await db
      .from("siga_files")
      .select(FILE_SELECT)
      .in("id", data.ids)
      .eq("school_id", membership.schoolId));
    if (error && missingOptionalColumn(error)) {
      ({ data: rows, error } = await db
        .from("siga_files")
        .select(FILE_SELECT_BASIC)
        .in("id", data.ids)
        .eq("school_id", membership.schoolId));
    }
    if (error) {
      if (missingFilesTable(error)) return { urls: {} as Record<string, string> };
      throw publicDatabaseError(error, "Não foi possível pré-visualizar os ficheiros.");
    }

    const visible = (rows ?? [])
      .map((row) => mapRow(row as Record<string, unknown>))
      .filter(
        (file) =>
          canSeeRow(file, userId, membership.appRole) &&
          canAccessFileContent(file, userId, membership.appRole) &&
          file.storageBackend === "sga",
      );
    if (!visible.length) return { urls: {} as Record<string, string> };

    const { data: signed, error: signError } = await db.storage.from(FILES_BUCKET).createSignedUrls(
      visible.map((file) => file.storagePath),
      600,
    );
    if (signError || !signed) return { urls: {} as Record<string, string> };

    const urlByPath = new Map(
      signed
        .filter((row): row is typeof row & { signedUrl: string } => Boolean(row.signedUrl))
        .map((row) => [row.path, row.signedUrl]),
    );
    const urls: Record<string, string> = {};
    for (const file of visible) {
      const url = urlByPath.get(file.storagePath);
      if (url) urls[file.id] = url;
    }
    return { urls };
  });
