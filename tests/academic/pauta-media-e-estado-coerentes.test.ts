import { describe, expect, it } from "vitest";
import { buildClassAcademicSummaries } from "@/features/academic/assessment-engine";
import type { AngolaTeachingCycle } from "@/lib/angola-academic";

/**
 * A pauta imprime a média e o estado lado a lado, e os dois saem do mesmo objecto. Se a
 * média for arredondada e o estado decidido sobre o valor bruto, o documento contradiz-se:
 * com MFDs de 9,9 e 10,0 a média bruta é 9,95, e a pauta dizia
 * **"Média 10,0 — NÃO TRANSITA"** (docs/auditoria/05-auditoria.md, 5.4).
 *
 * Um documento oficial tem de ser reproduzível a partir do que nele está escrito: quem lê
 * "10,0" tem de chegar ao mesmo resultado que a escola chegou.
 */

/** MT = (MAC + NPT) / 2, e MFD é a média dos períodos. Com MAC = NPT, MFD = esse valor. */
function notasQueDaoMfd(subjectId: string, mfd: number) {
  return ([1, 2, 3] as const).map((term) => ({
    id: `${subjectId}-${term}`,
    enrollment_id: "e1",
    subject_id: subjectId,
    term,
    mac: mfd,
    npp: null,
    npt: mfd,
  }));
}

function resumo(mfdsPretendidas: number[], cycle: AngolaTeachingCycle = "primario") {
  const subjects = mfdsPretendidas.map((_, i) => ({ id: `s${i}`, name: `Disciplina ${i}` }));
  const [summary] = buildClassAcademicSummaries({
    enrollments: [{ id: "e1", student_name: "Aluno de teste" }],
    subjects,
    termGrades: mfdsPretendidas.flatMap((mfd, i) => notasQueDaoMfd(`s${i}`, mfd)),
    cycle,
  });
  return summary!;
}

describe("coerência entre a média impressa e o estado impresso", () => {
  it("o caso que estava errado: 9,9 e 10,0 imprimiam 10,0 com NÃO TRANSITA", () => {
    const { overallMfd, status } = resumo([9.9, 10]);

    expect(overallMfd, "a média impressa continua a ser a arredondada").toBe(10);
    expect(status, "e o estado tem de ser o que essa média justifica").toBe("TRANSITA");
  });

  it("toda a faixa [9,95 ; 10,0[ imprime média 10,0 e estado coerente", () => {
    // Pares de MFDs com uma casa decimal cuja média cai na faixa.
    for (const par of [
      [9.9, 10],
      [9.8, 10.1],
      [10, 9.9],
      [9.7, 10.2],
    ]) {
      const { overallMfd, status } = resumo(par);
      expect(overallMfd, `média de ${JSON.stringify(par)}`).toBe(10);
      expect(status, `estado de ${JSON.stringify(par)} com média impressa 10`).toBe("TRANSITA");
    }
  });

  it("não promove quem está mesmo abaixo — 9,9 arredondado continua a ser 9,9", () => {
    const { overallMfd, status } = resumo([9.9, 9.9]);

    expect(overallMfd).toBe(9.9);
    expect(status).toBe("NÃO TRANSITA");
  });

  it("a média impressa e a decisão nunca se contradizem, em nenhuma combinação", () => {
    const valores = [8.4, 9.1, 9.4, 9.7, 9.8, 9.9, 10, 10.1, 10.4, 12.5, 15.6];
    const incoerentes: string[] = [];

    for (const a of valores) {
      for (const b of valores) {
        const { overallMfd, status } = resumo([a, b]);
        if (overallMfd === null) continue;
        const esperado = overallMfd >= 10 ? "TRANSITA" : "NÃO TRANSITA";
        if (status !== esperado) {
          incoerentes.push(`MFDs ${a}/${b} → média ${overallMfd} mas estado ${status}`);
        }
      }
    }

    expect(incoerentes, "a pauta imprimiria um número que não justifica o estado").toEqual([]);
  });
});
