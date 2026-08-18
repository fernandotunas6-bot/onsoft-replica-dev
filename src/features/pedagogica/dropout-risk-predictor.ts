/**
 * Algoritmo Preditivo de Risco de Desistência / Abandono Escolar (AI Co-Pilot).
 * Cruza Faltas (> 20%), Descida nas Notas (MAC/NPP < 10) e Propinas em Atraso (> 30 dias).
 */

export interface DropoutRiskStudent {
  studentId: string;
  studentName: string;
  className: string;
  processNumber: string;
  attendanceRate: number; // % (Ex: 75 = 25% faltas)
  averageGrade: number; // 0-20
  tuitionOverdueDays: number; // dias
  riskScore: number; // 0-100%
  riskLevel: "CRÍTICO" | "ALTO" | "MODERADO" | "BAIXO";
  primaryRiskReason: string;
  recommendedActions: string[];
}

export function calculateDropoutRiskScore(
  attendanceRate: number,
  averageGrade: number,
  tuitionOverdueDays: number,
): { score: number; level: "CRÍTICO" | "ALTO" | "MODERADO" | "BAIXO"; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Faltas (Peso 40%)
  if (attendanceRate < 75) {
    score += 40;
    reasons.push("Faltas excessivas (> 25%)");
  } else if (attendanceRate < 85) {
    score += 20;
    reasons.push("Faltas moderadas");
  }

  // Notas Baixas (Peso 35%)
  if (averageGrade < 8) {
    score += 35;
    reasons.push("Média crítica (< 8v)");
  } else if (averageGrade < 10) {
    score += 20;
    reasons.push("Média de reprovação (< 10v)");
  }

  // Propinas em Atraso (Peso 25%)
  if (tuitionOverdueDays > 60) {
    score += 25;
    reasons.push("Propinas em atraso há mais de 60 dias");
  } else if (tuitionOverdueDays > 30) {
    score += 15;
    reasons.push("Propina em atraso > 30 dias");
  }

  let level: "CRÍTICO" | "ALTO" | "MODERADO" | "BAIXO" = "BAIXO";
  if (score >= 65) level = "CRÍTICO";
  else if (score >= 45) level = "ALTO";
  else if (score >= 25) level = "MODERADO";

  return {
    score: Math.min(100, score),
    level,
    reason: reasons.join(" + ") || "Sem indicadores de risco",
  };
}

export function generateDropoutRiskReport(): DropoutRiskStudent[] {
  const mockStudents = [
    {
      studentId: "s1",
      studentName: "António Manuel Neto",
      className: "10ª Classe A",
      processNumber: "2024-0012",
      attendanceRate: 68,
      averageGrade: 7.5,
      tuitionOverdueDays: 45,
    },
    {
      studentId: "s2",
      studentName: "Beatriz dos Santos",
      className: "11ª Classe B",
      processNumber: "2024-0045",
      attendanceRate: 72,
      averageGrade: 9.1,
      tuitionOverdueDays: 62,
    },
    {
      studentId: "s3",
      studentName: "Carlos Eduardo Cambuta",
      className: "10ª Classe B",
      processNumber: "2024-0089",
      attendanceRate: 81,
      averageGrade: 8.8,
      tuitionOverdueDays: 15,
    },
  ];

  return mockStudents.map((s) => {
    const risk = calculateDropoutRiskScore(s.attendanceRate, s.averageGrade, s.tuitionOverdueDays);
    return {
      ...s,
      riskScore: risk.score,
      riskLevel: risk.level,
      primaryRiskReason: risk.reason,
      recommendedActions: [
        "Convocar encarregado de educação para reunião pedagógica urgente",
        "Acompanhamento e plano de recuperação pedagógica especial",
        "Encaminhamento para apoio na tesouraria",
      ],
    };
  });
}
