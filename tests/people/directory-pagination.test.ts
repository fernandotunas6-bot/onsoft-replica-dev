import { describe, expect, it, vi } from "vitest";
import { scanDirectoryPage } from "@/features/people/directory-pagination";

describe("scanDirectoryPage", () => {
  const rows = Array.from({ length: 340 }, (_, index) => ({
    id: index + 1,
    school: index % 2 === 0 ? "escola-A" : "escola-B",
    role: index >= 210 ? "aluno" : "outro",
  }));
  const read = vi.fn(async (offset: number, size: number) => rows.slice(offset, offset + size));

  it("conta e filtra em todo o universo, incluindo correspondências após os primeiros 200", async () => {
    const result = await scanDirectoryPage({
      page: 2,
      pageSize: 25,
      read,
      prepare: async (batch) =>
        batch.filter((row) => row.school === "escola-A" && row.role === "aluno"),
    });
    expect(result).toMatchObject({ total: 65, page: 2, pageSize: 25 });
    expect(result.items).toHaveLength(25);
    expect(result.items[0]?.id).toBe(261);
    expect(result.items.every((item) => item.school === "escola-A")).toBe(true);
  });

  it("uma página fora do intervalo é vazia mas conserva o total real", async () => {
    const result = await scanDirectoryPage({
      page: 50,
      pageSize: 25,
      read,
      prepare: async (batch) => batch.filter((row) => row.school === "escola-B"),
    });
    expect(result.total).toBe(170);
    expect(result.items).toEqual([]);
  });

  it("não devolve resultados parciais se a leitura falhar", async () => {
    await expect(
      scanDirectoryPage({
        page: 1,
        pageSize: 25,
        read: async (offset) => {
          if (offset >= 200) throw new Error("falha de rede");
          return rows.slice(offset, offset + 200);
        },
        prepare: async (batch) => batch,
      }),
    ).rejects.toThrow("falha de rede");
  });

  it("nunca apresenta um total truncado como exacto", async () => {
    await expect(
      scanDirectoryPage({
        page: 1,
        pageSize: 10,
        batchSize: 5,
        maxBatches: 2,
        read: async (offset, size) => rows.slice(offset, offset + size),
        prepare: async (batch) => batch,
      }),
    ).rejects.toThrow("excede o limite");
  });

  it("rejeita página e tamanho inválidos antes de consultar a base", async () => {
    const loader = vi.fn(async () => []);
    await expect(
      scanDirectoryPage({ page: 0, pageSize: 25, read: loader, prepare: async (a) => a }),
    ).rejects.toThrow("Página inválida");
    expect(loader).not.toHaveBeenCalled();
  });
});
