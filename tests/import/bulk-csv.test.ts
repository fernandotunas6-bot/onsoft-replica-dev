import { describe, expect, it } from "vitest";
import { parseImportFile } from "@/features/import/engine/parse";
import { commitImportBatchSchema } from "@/features/import/schemas";

function studentCsv(count: number) {
  const header = "Nome Completo;Bilhete de Identidade / Cédula;Gênero;Data de Nascimento;Telefone;Encarregado;Turma";
  const rows = Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(4, "0");
    return `Aluno Teste ${n};TESTE${n}LA000;M;2012-05-14;923${n.padStart(6, "0")};Encarregado ${n};7A`;
  });
  return [header, ...rows].join("\n");
}

describe("importação CSV em volume", () => {
  for (const total of [150, 300, 500]) {
    it(`lê ${total} alunos sem truncar nem perder cabeçalhos`, async () => {
      const parsed = await parseImportFile(Buffer.from(studentCsv(total), "utf-8"), `alunos-${total}.csv`);
      expect(parsed.sheets).toHaveLength(1);
      expect(parsed.sheets[0]?.rows).toHaveLength(total);
      expect(parsed.sheets[0]?.headers).toContain("Nome Completo");
      expect(parsed.sheets[0]?.rows[total - 1]?.["Nome Completo"]).toBe(
        `Aluno Teste ${String(total).padStart(4, "0")}`,
      );
    });
  }

  it("corrige clientes antigos que pedem lotes de 5 para lotes de 200", () => {
    const parsed = commitImportBatchSchema.parse({
      job_id: "11111111-1111-4111-8111-111111111111",
      batch_size: 5,
      dry_run: false,
      duplicate_strategy: "update",
      after_row_number: 0,
    });
    expect(parsed.batch_size).toBe(200);
  });

  it("mantém lotes maiores até ao limite seguro de 500", () => {
    const parsed = commitImportBatchSchema.parse({
      job_id: "11111111-1111-4111-8111-111111111111",
      batch_size: 500,
    });
    expect(parsed.batch_size).toBe(500);
  });
});
