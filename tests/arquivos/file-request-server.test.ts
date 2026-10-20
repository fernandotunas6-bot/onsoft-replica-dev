import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "src/features/arquivos/server.ts"), "utf8");
const files = readFileSync(resolve(process.cwd(), "src/features/arquivos/FileBrowser.tsx"), "utf8");

describe("contrato central de arquivos: limites de segurança", () => {
  it("revalida escola, visibilidade e finalidade sem revelar caminho ou URL", () => {
    const start = server.indexOf("export const resolveRequestedSchoolFile = createServerFn");
    const stop = server.indexOf("export const signSchoolFile = createServerFn", start);
    expect(start).toBeGreaterThan(0);
    expect(stop).toBeGreaterThan(start);
    const fn = server.slice(start, stop);
    expect(fn).toContain("loadSchoolFileRow(db, membership.schoolId, data.id)");
    expect(fn).toContain("canSeeRow(file, userId, membership.appRole)");
    expect(fn).toContain("canAccessFileContent(file, userId, membership.appRole)");
    expect(fn).toContain("fileMatchesRequest(file, data)");
    expect(fn).not.toContain("storagePath:");
    expect(fn).not.toContain("signedUrl");
  });

  it("reconhece retentativa de upload concluído antes de cobrar quota novamente", () => {
    const start = server.indexOf("export const registerSchoolFile = createServerFn");
    const stop = server.indexOf("export const createSchoolFolder = createServerFn", start);
    expect(start).toBeGreaterThan(0);
    expect(stop).toBeGreaterThan(start);
    const fn = server.slice(start, stop);
    const verifiedStorage = fn.indexOf(".info(data.storagePath)");
    const previousRecord = fn.indexOf("const registered = await db");
    const checkedIdentity = fn.indexOf("!isMatchingRegisteredUpload(registered.data");
    const checkedQuota = fn.indexOf("await assertCanStoreBytesForSchool");
    expect(verifiedStorage).toBeGreaterThan(0);
    expect(previousRecord).toBeGreaterThan(verifiedStorage);
    expect(checkedIdentity).toBeGreaterThan(previousRecord);
    expect(checkedQuota).toBeGreaterThan(checkedIdentity);
    expect(fn).toContain('.eq("school_id", membership.schoolId)');
    expect(fn).toContain('.is("deleted_at", null)');
  });

  it("só pesquisa ficheiros da escola e elimina os apagados da selecção", () => {
    const start = server.indexOf("export const findExistingSchoolFiles = createServerFn");
    const stop = server.indexOf("export function isOwnUploadPath", start);
    expect(start).toBeGreaterThan(0);
    expect(stop).toBeGreaterThan(start);
    const fn = server.slice(start, stop);
    expect(fn).toContain('.eq("school_id", membership.schoolId)');
    expect(fn).toContain('.is("deleted_at", null)');
    expect(fn).toContain("canSeeRow(viewer, userId, membership.appRole)");
    expect(fn).not.toContain("storage_path");
  });

  it("não publica ficheiros que existem apenas no IndexedDB do autor", () => {
    const start = server.indexOf("export const registerSchoolFile = createServerFn");
    const stop = server.indexOf("export const createSchoolFolder = createServerFn", start);
    expect(start).toBeGreaterThan(0);
    const fn = server.slice(start, stop);
    const localGuard = fn.indexOf('if (data.storageBackend === "local")');
    const localReturn = fn.indexOf('return { storage: "local" as const, record: null }');
    const remoteDb = fn.indexOf("const db = await loadSgaAdminClient()");
    const insert = fn.indexOf('.from("siga_files").insert');
    expect(localGuard).toBeGreaterThan(0);
    expect(localReturn).toBeGreaterThan(localGuard);
    expect(remoteDb).toBeGreaterThan(localReturn);
    expect(insert).toBeGreaterThan(remoteDb);

    const uploadStart = files.indexOf("const commitUpload = async");
    const uploadStop = files.indexOf("const commitOrganize = async", uploadStart);
    const upload = files.slice(uploadStart, uploadStop);
    expect(upload).toContain('backend === "local"');
    expect(upload).toContain('? { storage: "local" as const, record: null }');
    expect(upload).toContain(": await registerSchoolFile({");
    expect(upload).toContain("await saveLocalFile({");
  });

  it("não trata ficheiros locais legados como documentos partilháveis", () => {
    const listStart = server.indexOf("export const listSchoolFiles = createServerFn");
    const findStart = server.indexOf("export const findExistingSchoolFiles = createServerFn");
    const registerStart = server.indexOf("export const registerSchoolFile = createServerFn");
    const resolveStart = server.indexOf("export const resolveRequestedSchoolFile = createServerFn");
    const signStart = server.indexOf("export const signSchoolFile = createServerFn");
    expect(server.slice(listStart, findStart)).toContain('.neq("storage_backend", "local")');
    expect(server.slice(findStart, registerStart)).toContain('.eq("storage_backend", "sga")');
    expect(server.slice(resolveStart, signStart)).toContain('file.storageBackend !== "sga"');
    const shareStart = server.indexOf("export async function loadShareableSchoolFile(");
    expect(server.slice(shareStart, resolveStart)).toContain('row.storageBackend !== "sga"');
    expect(server.slice(signStart)).toContain("mapped.ownerUserId !== userId");
  });

  it("cache de Arquivos inclui escola, utilizador e papel", () => {
    expect(files).toContain('"list",\n      account.schoolId');
    expect(files).toContain("account.id,\n      account.role");
    expect(files).toContain('"existing-preupload",\n      account.schoolId,');
    expect(files).toContain('"previews",\n      account.schoolId,');
  });
});
