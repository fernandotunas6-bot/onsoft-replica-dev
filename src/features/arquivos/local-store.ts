import type { FileArea, FileVisibility } from "./kinds";
import type { SchoolFileRecord } from "./schemas";

const DB_NAME = "siga-files-v1";
const DB_VERSION = 1;
const META = "meta";
const BLOBS = "blobs";

type LocalMeta = SchoolFileRecord;

export type LocalFileViewer = { schoolId: string | null; ownerUserId: string };

/**
 * IndexedDB não tem RLS: todos os ficheiros locais são exclusivamente do
 * utilizador que os guardou, mesmo nas áreas Escola/Secretaria/Público.
 * O facto de partilharem escola não concede acesso ao disco do outro.
 */
export function isLocalFileOwnedByViewer(
  row: Pick<LocalMeta, "schoolId" | "ownerUserId">,
  viewer: LocalFileViewer,
): boolean {
  return Boolean(viewer.schoolId && viewer.ownerUserId) &&
    row.schoolId === viewer.schoolId &&
    row.ownerUserId === viewer.ownerUserId;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) {
        const meta = db.createObjectStore(META, { keyPath: "id" });
        meta.createIndex("schoolArea", ["schoolId", "area"], { unique: false });
        meta.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponível."));
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Falha no armazenamento local."));
    tx.onabort = () => reject(tx.error ?? new Error("Armazenamento local interrompido."));
  });
}

export function localStoragePath(input: {
  schoolId: string;
  area: FileArea;
  ownerUserId: string;
  id: string;
  name: string;
}) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const safe = input.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
  return `${input.schoolId}/${year}/${month}/${input.area}/${input.ownerUserId}/${input.id}-${safe}`;
}

export async function saveLocalFile(input: {
  record: LocalMeta;
  blob: Blob;
  viewer: LocalFileViewer;
}) {
  if (!isLocalFileOwnedByViewer(input.record, input.viewer)) {
    throw new Error("Não pode guardar um arquivo local de outra conta ou escola.");
  }
  const db = await openDb();
  try {
    const tx = db.transaction([META, BLOBS], "readwrite");
    const store = tx.objectStore(META);
    const previous = await new Promise<LocalMeta | undefined>((resolve, reject) => {
      const request = store.get(input.record.id);
      request.onsuccess = () => resolve(request.result as LocalMeta | undefined);
      request.onerror = () => reject(request.error);
    });
    if (previous && !isLocalFileOwnedByViewer(previous, input.viewer)) {
      tx.abort();
      throw new Error("Identificador de arquivo local pertencente a outra conta.");
    }
    store.put(input.record);
    tx.objectStore(BLOBS).put({ id: input.record.id, blob: input.blob });
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function listLocalFiles(input: {
  schoolId: string;
  ownerUserId: string;
  area?: FileArea | undefined;
  classGroupId?: string | undefined;
  parentId?: string | null;
  query?: string | undefined;
  limit: number;
}): Promise<SchoolFileRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    const tx = db.transaction(META, "readonly");
    const store = tx.objectStore(META);
    const rows = await new Promise<LocalMeta[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result ?? []) as LocalMeta[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const needle = input.query?.trim().toLowerCase() ?? "";
    return rows
      .filter((row) =>
        isLocalFileOwnedByViewer(row, {
          schoolId: input.schoolId,
          ownerUserId: input.ownerUserId,
        }),
      )
      .filter((row) => {
        if (input.area && row.area !== input.area) return false;
        if (input.classGroupId && row.classGroupId !== input.classGroupId) return false;
        if (input.parentId === null && !needle && row.parentId) return false;
        if (input.parentId && !needle && row.parentId !== input.parentId) return false;
        if (!needle) return true;
        return (
          row.name.toLowerCase().includes(needle) ||
          (row.title ?? "").toLowerCase().includes(needle) ||
          (row.referenceCode ?? "").toLowerCase().includes(needle) ||
          (row.description ?? "").toLowerCase().includes(needle)
        );
      })
      .map((row) => ({
        ...row,
        classGroupId: row.classGroupId ?? null,
        parentId: row.parentId ?? null,
        isFolder: Boolean(row.isFolder),
        title: row.title ?? null,
        description: row.description ?? null,
        category: row.category ?? "outro",
        documentDate: row.documentDate ?? null,
        referenceCode: row.referenceCode ?? null,
        relatedUserId: row.relatedUserId ?? null,
        relatedPersonId: row.relatedPersonId ?? null,
        relatedUserName: row.relatedUserName ?? null,
        relatedPersonName: row.relatedPersonName ?? null,
        isSystem: Boolean(row.isSystem),
        updatedAt: row.updatedAt ?? null,
        updatedByUserId: row.updatedByUserId ?? null,
        lastAction: row.lastAction ?? "created",
        lastActionAt: row.lastActionAt ?? row.createdAt,
        lastActionByUserId: row.lastActionByUserId ?? row.ownerUserId,
        ownerName: row.ownerName ?? null,
        updatedByName: row.updatedByName ?? null,
        lastActionByName: row.lastActionByName ?? null,
        ownerAvatarUrl: row.ownerAvatarUrl ?? null,
        updatedByAvatarUrl: row.updatedByAvatarUrl ?? null,
        lastActionByAvatarUrl: row.lastActionByAvatarUrl ?? null,
      }))
      .sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
      })
      .slice(0, input.limit);
  } catch {
    return [];
  }
}

export async function saveLocalFolder(
  record: SchoolFileRecord,
  viewer: LocalFileViewer,
) {
  if (typeof indexedDB === "undefined") return;
  if (!isLocalFileOwnedByViewer(record, viewer)) {
    throw new Error("Não pode guardar uma pasta local de outra conta ou escola.");
  }
  const db = await openDb();
  try {
    const tx = db.transaction(META, "readwrite");
    const store = tx.objectStore(META);
    const previous = await new Promise<LocalMeta | undefined>((resolve, reject) => {
      const request = store.get(record.id);
      request.onsuccess = () => resolve(request.result as LocalMeta | undefined);
      request.onerror = () => reject(request.error);
    });
    if (previous && !isLocalFileOwnedByViewer(previous, viewer)) {
      tx.abort();
      throw new Error("Identificador de pasta local pertencente a outra conta.");
    }
    store.put(record);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function patchLocalFileMeta(
  id: string,
  patch: Partial<
    Pick<
      SchoolFileRecord,
      | "name"
      | "classGroupId"
      | "visibility"
      | "area"
      | "title"
      | "description"
      | "category"
      | "documentDate"
      | "referenceCode"
      | "relatedUserId"
      | "relatedPersonId"
      | "parentId"
      | "isFolder"
    >
  >,
  viewer: LocalFileViewer,
) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(META, "readwrite");
  const store = tx.objectStore(META);
  const existing = await new Promise<LocalMeta | undefined>((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as LocalMeta | undefined);
    request.onerror = () => reject(request.error);
  });
  if (existing) {
    if (!isLocalFileOwnedByViewer(existing, viewer)) {
      db.close();
      throw new Error("Não pode modificar um arquivo local de outra conta ou escola.");
    }
    store.put({
      ...existing,
      ...patch,
      classGroupId: patch.classGroupId === undefined ? existing.classGroupId : patch.classGroupId,
      visibility: patch.visibility ?? existing.visibility,
      updatedAt: new Date().toISOString(),
    });
  }
  await txDone(tx);
  db.close();
}

export async function readLocalBlob(
  id: string,
  viewer: LocalFileViewer,
): Promise<Blob | null> {
  if (typeof indexedDB === "undefined" || !viewer.schoolId || !viewer.ownerUserId) return null;
  try {
    const db = await openDb();
    const tx = db.transaction([META, BLOBS], "readonly");
    const meta = await new Promise<LocalMeta | undefined>((resolve, reject) => {
      const request = tx.objectStore(META).get(id);
      request.onsuccess = () => resolve(request.result as LocalMeta | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!meta || !isLocalFileOwnedByViewer(meta, viewer)) {
      db.close();
      return null;
    }
    const row = await new Promise<{ id: string; blob: Blob } | undefined>((resolve, reject) => {
      const request = tx.objectStore(BLOBS).get(id);
      request.onsuccess = () => resolve(request.result as { id: string; blob: Blob } | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return row?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteLocalFile(id: string, viewer: LocalFileViewer) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const tx = db.transaction([META, BLOBS], "readwrite");
    const metaStore = tx.objectStore(META);
    const existing = await new Promise<LocalMeta | undefined>((resolve, reject) => {
      const request = metaStore.get(id);
      request.onsuccess = () => resolve(request.result as LocalMeta | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!existing) return;
    if (!isLocalFileOwnedByViewer(existing, viewer)) {
      tx.abort();
      throw new Error("Não pode apagar um arquivo local de outra conta ou escola.");
    }
    metaStore.delete(id);
    tx.objectStore(BLOBS).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}
