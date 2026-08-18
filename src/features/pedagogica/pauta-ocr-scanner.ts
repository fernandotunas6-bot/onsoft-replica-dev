/**
 * Motor de OCR e Leitura Ótica de Pautas Físicas em Papel (AI Co-Pilot Pedagógico).
 * Analisa a fotografia da pauta física enviada pelo professor, extrai nomes/processos
 * de alunos e converte automaticamente em notas digitais (MAC, NPP, NPT).
 */

export interface OcrGradeItem {
  studentName: string;
  academicNumber: string;
  mac?: number;
  npp?: number;
  npt?: number;
  confidence: number; // 0-100%
  status: "verified" | "warning" | "error";
}

export interface OcrScanResult {
  className?: string;
  subjectName?: string;
  term?: string;
  items: OcrGradeItem[];
  scannedAt: string;
  totalStudentsFound: number;
}

/**
 * Simula a análise OCR e extração inteligente da imagem da pauta.
 */
export async function scanPaperPautaImage(
  imageFile: File | Blob | string,
  existingClassStudents: Array<{ id: string; fullName: string; academicNumber: string }>,
): Promise<OcrScanResult> {
  // Simula latência de processamento OCR de visão computacional (800ms)
  await new Promise((resolve) => setTimeout(resolve, 800));

  const items: OcrGradeItem[] = existingClassStudents.map((s, index) => {
    // Simula notas extraídas com base em padrões de pautas angolanas (escala 0-20)
    const baseMac = Math.min(20, Math.max(4, Math.floor(10 + (index % 7) * 1.5)));
    const baseNpp = Math.min(20, Math.max(5, Math.floor(11 + ((index + 2) % 6) * 1.4)));
    const baseNpt = Math.min(20, Math.max(6, Math.floor(9 + ((index + 4) % 8) * 1.3)));

    const confidence = index === 2 ? 78 : 96; // 1 caso com menor confiança para alerta visual

    return {
      studentName: s.fullName,
      academicNumber: s.academicNumber,
      mac: baseMac,
      npp: baseNpp,
      npt: baseNpt,
      confidence,
      status: confidence < 80 ? "warning" : "verified",
    };
  });

  return {
    className: "Turma Seleccionada",
    subjectName: "Disciplina Ativa",
    term: "1º Trimestre",
    items,
    scannedAt: new Date().toISOString(),
    totalStudentsFound: items.length,
  };
}
