import { describe, expect, it } from "vitest";
import {
  normalizeText,
  foldForCompare,
  normalizeDate,
  normalizeNumber,
  normalizePhoneDigits,
  normalizeGender,
  isBlankRow,
} from "@/features/import/engine/normalize";
import {
  scorePersonDuplicate,
  findBestPersonMatch,
  canonicalEntityKey,
  findBestEntityMatch,
  PERSON_DUPLICATE_THRESHOLD,
} from "@/features/import/engine/dedupe";
import { suggestModule, suggestColumnMapping } from "@/features/import/engine/suggest";

describe("Motor de Importação — normalização", () => {
  it("remove espaços duplicados e aparas", () => {
    expect(normalizeText("  João   Manuel  ")).toBe("João Manuel");
  });

  it("foldForCompare ignora acentos e maiúsculas", () => {
    expect(foldForCompare("João")).toBe(foldForCompare("joao"));
  });

  it("normaliza datas AAAA-MM-DD e DD-MM-AAAA para ISO", () => {
    expect(normalizeDate("2012-05-14")).toBe("2012-05-14");
    expect(normalizeDate("14-05-2012")).toBe("2012-05-14");
    expect(normalizeDate("14/05/2012")).toBe("2012-05-14");
  });

  it("normaliza número de série Excel (dias desde 1899-12-30) para ISO", () => {
    // 41043 = 2012-05-14 no calendário Excel.
    expect(normalizeDate(41043)).toBe("2012-05-14");
  });

  it("rejeita datas inválidas em vez de adivinhar", () => {
    expect(normalizeDate("31-13-2012")).toBeNull();
    expect(normalizeDate("texto qualquer")).toBeNull();
  });

  it("normaliza números em formato PT/AO (milhar por ponto, decimal por vírgula)", () => {
    expect(normalizeNumber("1.234,56")).toBeCloseTo(1234.56);
    expect(normalizeNumber("25000")).toBe(25000);
  });

  it("normaliza telefone removendo indicativo 244", () => {
    expect(normalizePhoneDigits("+244 923 112 233")).toBe("923112233");
    expect(normalizePhoneDigits("923112233")).toBe("923112233");
  });

  it("reconhece género em PT e EN", () => {
    expect(normalizeGender("M")).toBe("male");
    expect(normalizeGender("Feminino")).toBe("female");
    expect(normalizeGender("")).toBeNull();
  });

  it("identifica linhas totalmente vazias", () => {
    expect(isBlankRow({ a: "", b: null, c: undefined })).toBe(true);
    expect(isBlankRow({ a: "x" })).toBe(false);
  });
});

describe("Motor de Importação — deduplicação de pessoas", () => {
  const existing = [
    {
      id: "p1",
      full_name: "João Manuel António",
      email: null,
      phone: "923112233",
      national_id: "005432190LA048",
      date_of_birth: "2012-05-14",
      status: "active",
    },
  ];

  it("nome exacto + BI + data de nascimento pontua muito acima do limiar", () => {
    const { score, reasons } = scorePersonDuplicate(
      {
        full_name: "João Manuel António",
        national_id: "005432190LA048",
        date_of_birth: "2012-05-14",
      },
      existing[0],
    );
    expect(score).toBeGreaterThanOrEqual(PERSON_DUPLICATE_THRESHOLD);
    expect(reasons).toContain("nome exacto");
    expect(reasons).toContain("documento/NIF");
  });

  it("nome sozinho, diferente, não basta para marcar duplicado", () => {
    const match = findBestPersonMatch({ full_name: "Maria Silva" }, existing);
    expect(match).toBeNull();
  });

  it("findBestPersonMatch devolve o registo mais parecido", () => {
    const match = findBestPersonMatch(
      { full_name: "João Manuel António", phone: "923112233" },
      existing,
    );
    expect(match?.record.id).toBe("p1");
  });
});

describe("Motor de Importação — correspondência de turmas/entidades", () => {
  it('"7ª A" e "7A" resolvem à mesma chave canónica', () => {
    expect(canonicalEntityKey("7ª A")).toBe(canonicalEntityKey("7A"));
  });

  it("encontra a turma existente por nome aproximado, sem criar duplicada", () => {
    const groups = [{ id: "g1", name: "7A" }];
    const found = findBestEntityMatch("7ª A", groups, (g) => g.name);
    expect(found?.id).toBe("g1");
  });

  it("não inventa correspondência para uma turma que não existe", () => {
    const groups = [{ id: "g1", name: "7A" }];
    expect(findBestEntityMatch("11C", groups, (g) => g.name)).toBeNull();
  });
});

describe("Motor de Importação — sugestão de módulo e mapeamento", () => {
  it("sugere 'alunos' para cabeçalhos típicos de uma folha de alunos", () => {
    const result = suggestModule(["Nome Completo", "Turma", "Encarregado", "Data de Nascimento"]);
    expect(result.module).toBe("alunos");
    expect(result.score).toBeGreaterThan(0);
  });

  it("sugere 'pagamentos' para cabeçalhos financeiros", () => {
    const result = suggestModule(["Aluno", "Valor Pago (Kz)", "Referência", "Data do Pagamento"]);
    expect(result.module).toBe("pagamentos");
  });

  it("mapeia cabeçalhos do ficheiro para as chaves oficiais do módulo", () => {
    const mapping = suggestColumnMapping(
      ["Nome Completo", "Data de Nascimento", "Coluna Estranha"],
      "alunos",
    );
    expect(mapping["Nome Completo"]).toBe("full_name");
    expect(mapping["Data de Nascimento"]).toBe("birth_date");
    expect(mapping["Coluna Estranha"]).toBe("ignore");
  });
});
