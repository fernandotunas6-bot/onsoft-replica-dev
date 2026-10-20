import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "src/features/arquivos/server.ts"), "utf8");
const files = readFileSync(resolve(process.cwd(), "src/features/arquivos/FileBrowser.tsx"), "utf8");
const grid = readFileSync(
  resolve(process.cwd(), "src/features/arquivos/FileBrowserGrid.tsx"),
  "utf8",
);
const table = readFileSync(
  resolve(process.cwd(), "src/features/arquivos/FileBrowserTable.tsx"),
  "utf8",
);
const picker = readFileSync(
  resolve(process.cwd(), "src/features/arquivos/FilePickerModal.tsx"),
  "utf8",
);

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

  it("associação de materiais revalida ACL, finalidade e estado da turma", () => {
    const start = server.indexOf("export const linkSchoolFileToClass = createServerFn");
    const stop = server.indexOf("export const deleteSchoolFile = createServerFn", start);
    expect(start).toBeGreaterThan(0);
    expect(stop).toBeGreaterThan(start);
    const fn = server.slice(start, stop);
    expect(fn).toContain("loadSchoolFileRow(db, membership.schoolId, data.id)");
    expect(fn).toContain('purpose: "class-material"');
    expect(fn).toContain("canSeeRow(file, userId, membership.appRole)");
    expect(fn).toContain("canAccessFileContent(file, userId, membership.appRole)");
    expect(fn).toContain("file.classGroupId");
    expect(fn).toContain('.is("deleted_at", null)');
    expect(fn).toContain('.select("id")');
    expect(fn).toContain("if (!fallback.data)");
    expect(fn).toContain("else if (!changed)");
  });

  it("fallback de consulta preserva sempre os atributos críticos de autorização", () => {
    for (const constant of ["FILE_SELECT_CLASS", "FILE_SELECT_BASIC"]) {
      const select = server.match(new RegExp(`const ${constant} =\\s*"(.*?)"`))?.[1];
      expect(select).toBeDefined();
      for (const name of ["is_system", "is_folder", "related_user_id", "storage_backend"]) {
        expect(select?.split(", ")).toContain(name);
      }
    }
    const singleStart = server.indexOf("export const signSchoolFile = createServerFn");
    const bulkStart = server.indexOf("export const signSchoolFiles = createServerFn");
    expect(server.slice(singleStart, bulkStart)).toContain("mapped.isFolder");
    expect(server.slice(bulkStart)).toContain("!file.isFolder");
  });

  it("mostra ficheiros locais como exclusivos do dispositivo, não da escola", () => {
    expect(grid).toContain('file.storageBackend === "local"');
    expect(grid).toContain("Só neste dispositivo");
    expect(table).toContain('file.storageBackend === "local"');
    expect(table).toContain("Só neste dispositivo");
  });

  it("aplica escopo docente à listagem, picker e associação final", () => {
    const listStart = server.indexOf("export const listSchoolFiles = createServerFn");
    const listEnd = server.indexOf(
      "export const findExistingSchoolFiles = createServerFn",
      listStart,
    );
    const linkStart = server.indexOf("export const linkSchoolFileToClass = createServerFn");
    const linkEnd = server.indexOf("export const deleteSchoolFile = createServerFn", linkStart);
    const resolveStart = server.indexOf("export const resolveRequestedSchoolFile = createServerFn");
    const resolveEnd = server.indexOf("export const signSchoolFile = createServerFn", resolveStart);
    for (const fn of [
      server.slice(listStart, listEnd),
      server.slice(linkStart, linkEnd),
      server.slice(resolveStart, resolveEnd),
    ]) {
      expect(fn).toContain("await assertClassMaterialScope(db, {");
      expect(fn).toContain("membership.schoolId");
      expect(fn).toContain("membership.allAppRoles ?? [membership.appRole]");
    }
    expect(server.slice(resolveStart, resolveEnd)).toContain('data.purpose === "class-material"');
    expect(server.slice(linkStart, linkEnd)).toContain("data.classGroupId ?? file.classGroupId");
  });

  it("carregamento do professor só é admitido para turma atribuída e conteúdo escolar", () => {
    const start = server.indexOf("export const registerSchoolFile = createServerFn");
    const stop = server.indexOf("export const createSchoolFolder = createServerFn", start);
    const register = server.slice(start, stop);
    expect(register).toContain('membership.appRole === "Professor"');
    expect(register).toContain("Boolean(data.classGroupId)");
    expect(register).toContain('data.area === "escola"');
    expect(register).toContain('data.visibility === "school"');
    expect(register).toContain(
      "!canWriteFileArea(membership.appRole, data.area) && !assignedClassUpload",
    );
    expect(register).toContain("await assertClassMaterialScope(db, {");
    expect(register).toContain("classGroupId: data.classGroupId");
    expect(register).toContain("roles: membership.allAppRoles ?? [membership.appRole]");
  });

  it("selector associa novos uploads à turma sem limitar a escolha de ficheiros existentes", () => {
    expect(picker).toContain('request?.purpose === "class-material"');
    expect(picker).toContain("uploadClassGroupId={");
    expect(files).toContain("uploadClassGroupId ?? activeClassId");
    expect(files).toContain("classGroupId: targetClassGroupId");
    expect(files).toContain('targetArea !== "escola" || meta.visibility !== "school"');
    expect(files).toContain("classGroupId: uploadClassGroupId, limit: 1");
    expect(files).toContain("await listSchoolFiles({");
  });

  it("cache de Arquivos inclui escola, utilizador e papel", () => {
    expect(files).toContain('"list",\n      account.schoolId');
    expect(files).toContain("account.id,\n      account.role");
    expect(files).toContain('"existing-preupload",\n      account.schoolId,');
    expect(files).toContain('"previews",\n      account.schoolId,');
  });
});
