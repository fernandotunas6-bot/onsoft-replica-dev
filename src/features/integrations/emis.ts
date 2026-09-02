import type { StudentRow } from "@/features/students/schemas";

/**
 * Normaliza o grau de ensino para a taxonomia do EMIS (Angola).
 */
export function normalizeEmisGradeLevel(gradeName: string | null): string {
  if (!gradeName) return "Desconhecido";
  const gn = gradeName.toLowerCase();
  if (gn.includes("13ª") || gn.includes("13a") || gn.includes("décima terceira")) return "13ª Classe";
  if (gn.includes("12ª") || gn.includes("12a") || gn.includes("décima segunda")) return "12ª Classe";
  if (gn.includes("11ª") || gn.includes("11a") || gn.includes("décima primeira")) return "11ª Classe";
  if (gn.includes("10ª") || gn.includes("10a") || gn.includes("décima") || gn.includes("decima")) return "10ª Classe";
  if (gn.includes("9ª") || gn.includes("9a") || gn.includes("nona")) return "9ª Classe";
  if (gn.includes("8ª") || gn.includes("8a") || gn.includes("oitava")) return "8ª Classe";
  if (gn.includes("7ª") || gn.includes("7a") || gn.includes("sétima") || gn.includes("setima")) return "7ª Classe";
  if (gn.includes("6ª") || gn.includes("6a") || gn.includes("sexta")) return "6ª Classe";
  if (gn.includes("5ª") || gn.includes("5a") || gn.includes("quinta")) return "5ª Classe";
  if (gn.includes("4ª") || gn.includes("4a") || gn.includes("quarta")) return "4ª Classe";
  if (gn.includes("3ª") || gn.includes("3a") || gn.includes("terceira")) return "3ª Classe";
  if (gn.includes("2ª") || gn.includes("2a") || gn.includes("segunda")) return "2ª Classe";
  if (gn.includes("1ª") || gn.includes("1a") || gn.includes("primeira")) return "1ª Classe";
  if (gn.includes("iniciação") || gn.includes("iniciacao")) return "Iniciação";
  return "Outro";
}

/**
 * Exporta dados de estudantes no formato requerido pelo gateway EMIS.
 */
export function buildEmisExportPayload(schoolId: string, students: StudentRow[]) {
  return students.map((student) => ({
    emis_school_id: schoolId,
    student_id: student.id,
    registration_number: student.registration_number,
    full_name: student.full_name,
    gender: student.sex === "male" ? "M" : student.sex === "female" ? "F" : "U",
    birth_date: student.date_of_birth ?? null,
    academic_year: student.academic_year ?? null,
    class_name: student.class_name ?? null,
    emis_grade: normalizeEmisGradeLevel(student.grade_name),
    guardian_name: student.primary_guardian_name ?? null,
    national_id: student.document_number ?? null,
    status: student.student_status,
  }));
}
