import { describe, expect, it } from "vitest";
import {
  classifyExistingFile,
  describeFileLocation,
  type ExistingSchoolFileLocation,
} from "@/features/arquivos/find-existing";

const stored: ExistingSchoolFileLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Relatório.pdf",
  sizeBytes: 2048,
  area: "secretaria",
  parentId: "22222222-2222-4222-8222-222222222222",
  folderName: "Contratos",
};

describe("detecção segura de localização dos arquivos", () => {
  it("identifica um possível duplicado na pasta seleccionada", () => {
    expect(
      classifyExistingFile(stored, { name: "relatório.pdf", size: 2048 }, "secretaria", stored.parentId),
    ).toBe("same-folder");
  });

  it("identifica ficheiros em outra pasta ou área sem os mover", () => {
    expect(
      classifyExistingFile(stored, { name: stored.name, size: 2048 }, "secretaria", null),
    ).toBe("another-folder");
    expect(
      classifyExistingFile(stored, { name: stored.name, size: 2048 }, "escola", stored.parentId),
    ).toBe("another-folder");
  });

  it("não confunde nomes ou tamanhos diferentes com conteúdo idêntico", () => {
    expect(
      classifyExistingFile(stored, { name: stored.name, size: 4096 }, "secretaria", stored.parentId),
    ).toBe("same-name");
    expect(
      classifyExistingFile(stored, { name: "Outro.pdf", size: 2048 }, "secretaria", stored.parentId),
    ).toBeNull();
  });

  it("identifica localização sem publicar caminhos de Storage", () => {
    const labels = {
      escola: "Escola",
      secretaria: "Secretaria",
      pessoal: "Pessoal",
      publico: "Público",
    };
    expect(describeFileLocation(stored, labels)).toBe("Secretaria / Contratos");
    expect(describeFileLocation({ ...stored, parentId: null }, labels)).toBe("Secretaria / Raiz");
    expect(describeFileLocation({ ...stored, folderName: null }, labels)).toBe(
      "Secretaria / Pasta reservada",
    );
  });
});
