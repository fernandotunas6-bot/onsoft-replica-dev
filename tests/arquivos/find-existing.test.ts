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
  const incoming = { name: stored.name, size: stored.sizeBytes };

  it("identifica um possível duplicado na pasta seleccionada", () => {
    const placement = classifyExistingFile(stored, incoming, "secretaria", stored.parentId);
    expect(placement).toBe("same-folder");
  });

  it("identifica ficheiros em outra pasta ou área sem os mover", () => {
    expect(classifyExistingFile(stored, incoming, "secretaria", null)).toBe("another-folder");
    const otherArea = classifyExistingFile(stored, incoming, "escola", stored.parentId);
    expect(otherArea).toBe("another-folder");
  });

  it("não confunde nomes ou tamanhos diferentes com conteúdo idêntico", () => {
    const bigger = { name: stored.name, size: 4096 };
    const renamed = { name: "Outro.pdf", size: stored.sizeBytes };
    expect(classifyExistingFile(stored, bigger, "secretaria", stored.parentId)).toBe("same-name");
    expect(classifyExistingFile(stored, renamed, "secretaria", stored.parentId)).toBeNull();
    const alteredCase = { name: "relatório.pdf", size: stored.sizeBytes };
    expect(classifyExistingFile(stored, alteredCase, "secretaria", stored.parentId)).toBeNull();
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
