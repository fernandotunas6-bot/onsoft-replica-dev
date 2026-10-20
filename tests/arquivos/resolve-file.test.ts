import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";
import type { LocalFileViewer } from "@/features/arquivos/local-store";

const mocks = vi.hoisted(() => ({
  signSchoolFile: vi.fn(),
  readLocalBlob: vi.fn(),
}));

vi.mock("@/features/arquivos/server", () => ({
  signSchoolFile: mocks.signSchoolFile,
}));

vi.mock("@/features/arquivos/local-store", () => ({
  readLocalBlob: mocks.readLocalBlob,
}));

import { resolveFileBlob, resolveFileUrl } from "@/features/arquivos/resolve-file";

const file = {
  id: "11111111-1111-4111-8111-111111111111",
  storageBackend: "sga",
} as SchoolFileRecord;

const viewer: LocalFileViewer = {
  schoolId: "school-1",
  ownerUserId: "user-1",
};

describe("resolução segura do conteúdo do Arquivo", () => {
  beforeEach(() => {
    mocks.signSchoolFile.mockReset();
    mocks.readLocalBlob.mockReset();
  });

  it("não revela cópia local quando o servidor não consegue assinar o remoto", async () => {
    mocks.signSchoolFile.mockResolvedValue({ local: false, url: null });
    mocks.readLocalBlob.mockResolvedValue(new Blob(["cópia antiga"]));
    await expect(resolveFileUrl(file, viewer)).rejects.toThrow("Não foi possível abrir");
    await expect(resolveFileBlob(file, viewer)).rejects.toThrow("Não foi possível abrir");
    expect(mocks.readLocalBlob).not.toHaveBeenCalled();
  });

  it("mantém o fallback apenas se o servidor indicar origem local", async () => {
    const blob = new Blob(["arquivo local"], { type: "application/pdf" });
    mocks.signSchoolFile.mockResolvedValue({ local: true, url: null });
    mocks.readLocalBlob.mockResolvedValue(blob);
    await expect(resolveFileBlob(file, viewer)).resolves.toBe(blob);
    expect(mocks.readLocalBlob).toHaveBeenCalledWith(file.id, viewer);
  });

  it("usa assinatura válida do Storage sem consultar cópias locais", async () => {
    mocks.signSchoolFile.mockResolvedValue({
      local: false,
      url: "https://storage.example.test/signed",
    });
    await expect(resolveFileUrl(file, viewer)).resolves.toBe(
      "https://storage.example.test/signed",
    );
    expect(mocks.readLocalBlob).not.toHaveBeenCalled();
  });

  it("não consulta IndexedDB quando a autorização do servidor falha", async () => {
    mocks.signSchoolFile.mockRejectedValue(new Error("Sem permissão."));
    mocks.readLocalBlob.mockResolvedValue(new Blob(["cópia antiga"]));
    await expect(resolveFileBlob(file, viewer)).rejects.toThrow("Sem permissão.");
    expect(mocks.readLocalBlob).not.toHaveBeenCalled();
  });
});
