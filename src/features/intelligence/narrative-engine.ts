import type { StudentRelationsSnapshot } from "./students/student-relations-adapter";

export function generateStudentNarrativeReport(
  snapshot: StudentRelationsSnapshot,
  studentName: string,
): string {
  const intro = `Olá! Resumo escolar de ${studentName}:\n`;
  
  const lines: string[] = [];

  // Avaliação académica
  if (snapshot.academic.finalAverage !== null) {
    if (snapshot.academic.finalAverage >= 14) {
      lines.push(`✅ Excelente desempenho! A média atual é de ${snapshot.academic.finalAverage} valores.`);
    } else if (snapshot.academic.finalAverage >= 10) {
      lines.push(`📚 Desempenho satisfatório (média: ${snapshot.academic.finalAverage}). Pode melhorar!`);
    } else {
      lines.push(`⚠️ Atenção: A média encontra-se abaixo do exigido (${snapshot.academic.finalAverage} valores). Sugerimos acompanhamento.`);
    }
  } else {
    lines.push(`ℹ️ Ainda sem avaliações processadas no trimestre atual.`);
  }

  // Comportamento / Assiduidade
  if (snapshot.academic.absences != null) {
    if (snapshot.academic.absences > 5) {
      lines.push(`⚠️ Registo de ${snapshot.academic.absences} faltas não justificadas. Por favor, regularize a situação.`);
    } else if (snapshot.academic.absences > 0) {
      lines.push(`ℹ️ Registo de ${snapshot.academic.absences} faltas.`);
    } else {
      lines.push(`🌟 Assiduidade perfeita! Nenhuma falta registada.`);
    }
  } else if (snapshot.academic.attendanceRate != null) {
    const rate = snapshot.academic.attendanceRate;
    if (rate < 80) {
      lines.push(`⚠️ Assiduidade baixa (${rate.toFixed(1)}%). Recomenda-se acompanhamento.`);
    } else if (rate >= 95) {
      lines.push(`🌟 Assiduidade excelente (${rate.toFixed(1)}%).`);
    } else {
      lines.push(`ℹ️ Assiduidade regular (${rate.toFixed(1)}%).`);
    }
  }

  // Financeiro
  if (snapshot.finance.overdueCount > 0) {
    lines.push(`\n💰 Lembrete Financeiro: Existem faturas por liquidar na tesouraria.`);
  } else {
    lines.push(`\n💰 Situação financeira regularizada. Obrigado!`);
  }

  // Documentos
  if (snapshot.documents.pendingCount > 0) {
    lines.push(`\n📄 Tem pedidos de documentos pendentes a aguardar levantamento/ação.`);
  }

  return intro + "\n" + lines.join("\n");
}
