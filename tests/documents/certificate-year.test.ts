import { describe, expect, it } from "vitest";
import { isPassingOutcome, latestCertifiableYear } from "@/features/documents/certificate-year";

const year = (name: string, outcome: string | null) => ({
  academicYearName: name,
  official: outcome == null ? null : { outcome },
});

describe("ano do certificado de habilitações", () => {
  it("salta o último ano reprovado e certifica o último concluído", () => {
    const years = [
      year("2023/2024", "Transitou"),
      year("2024/2025", "Não transitou"),
      year("2025/2026", null),
    ];
    expect(latestCertifiableYear(years)?.academicYearName).toBe("2023/2024");
  });

  it("sem nenhum ano aprovado, não há certificado", () => {
    expect(latestCertifiableYear([year("2024/2025", "Incompleto")])).toBeNull();
    expect(latestCertifiableYear([])).toBeNull();
  });

  it("aceita os resultados importados em texto livre", () => {
    for (const ok of ["Transitou", "Aprovado", "Concluído com Êxito", "APTO"]) {
      expect(isPassingOutcome(ok), ok).toBe(true);
    }
    for (const no of ["Não transitou", "Reprovado", "Transferido", "Inapto", "Anulado", ""]) {
      expect(isPassingOutcome(no), no).toBe(false);
    }
  });
});
