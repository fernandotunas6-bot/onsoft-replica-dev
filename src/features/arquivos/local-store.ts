import type { FileArea, FileVisibility } from "./kinds";
import type { SchoolFileRecord } from "./schemas";

const DB_NAME = "siga-files-v1";
const DB_VERSION = 1;
const META = "meta";
const BLOBS = "blobs";

type LocalMeta = SchoolFileRecord;

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
  const safe = input.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return `${input.schoolId}/${year}/${month}/${input.area}/${input.ownerUserId}/${input.id}-${safe}`;
}

export async function saveLocalFile(input: {
  record: LocalMeta;
  blob: Blob;
}) {
  const db = await openDb();
  const tx = db.transaction([META, BLOBS], "readwrite");
  tx.objectStore(META).put(input.record);
  tx.objectStore(BLOBS).put({ id: input.record.id, blob: input.blob });
  await txDone(tx);
  db.close();
}

export async function listLocalFiles(input: {
  schoolId: string;
  ownerUserId: string;
  area?: FileArea;
  classGroupId?: string;
  parentId?: string | null;
  query?: string;
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
      .filter((row) => row.schoolId === input.schoolId)
      .filter((row) => {
        if (row.area === "pessoal" && row.ownerUserId !== input.ownerUserId) return false;
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

export async function saveLocalFolder(record: SchoolFileRecord) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(META, "readwrite");
  tx.objectStore(META).put(record);
  await txDone(tx);
  db.close();
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
    store.put({
      ...existing,
      ...patch,
      classGroupId:
        patch.classGroupId === undefined ? existing.classGroupId : patch.classGroupId,
      visibility: patch.visibility ?? existing.visibility,
      updatedAt: new Date().toISOString(),
    });
  }
  await txDone(tx);
  db.close();
}

export async function readLocalBlob(id: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const tx = db.transaction(BLOBS, "readonly");
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

export async function deleteLocalFile(id: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction([META, BLOBS], "readwrite");
  tx.objectStore(META).delete(id);
  tx.objectStore(BLOBS).delete(id);
  await txDone(tx);
  db.close();
}
