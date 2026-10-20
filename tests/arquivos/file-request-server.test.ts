import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(
  resolve(process.cwd(), "src/features/arquivos/server.ts"),
  "utf8",
);
const files = readFileSync(
  resolve(process.cwd(), "src/features/arquivos/FileBrowser.tsx"),
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

  it("cache de Arquivos inclui escola, utilizador e papel", () => {
    expect(files).toContain('"list",\n      account.schoolId,\n      account.id,\n      account.role');
    expect(files).toContain('"existing-preupload",\n      account.schoolId,');
    expect(files).toContain('"previews",\n      account.schoolId,');
  });
});
