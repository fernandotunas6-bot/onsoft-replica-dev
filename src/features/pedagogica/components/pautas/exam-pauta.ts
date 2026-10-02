import { recursoFinal } from "@/lib/angola-academic";
import { calculateExamFinalGrade, normalizeGrade, roundGrade } from "./assessment";
import type { ExamPautaStudent, Gender, StudentStatus } from "./types";
import type { OfficialPautaSummary } from "./official-pauta";

type ExamAssessmentItem = {
  id: string;
  component?: string | null;
};

type ExamAssessmentScore = {
  item_id: string;
  enrollment_id: string;
  score?: number | null;
};

type ExamEnrollment = {
  id: string;
  student_name: string;
  student_gender?: string | null;
  registration_number?: string | null;
};

function toGender(sex: string | null | undefined): Gender {
  if (sex === "male") return "M";
  if (sex === "female") return "F";
  return "";
}

function componentAverage(
  component: string,
  enrollmentId: string,
  items: ExamAssessmentItem[],
  scores: ExamAssessmentScore[],
): number | null {
  const itemIds = new Set(
    items.filter((item) => item.component === component).map((item) => String(item.id)),
  );
  const values = scores
    .filter((score) => score.enrollment_id === enrollmentId && itemIds.has(String(score.item_id)))
    .map((score) => normalizeGrade(score.score))
    .filter((score): score is number => score !== null);

  if (values.length === 0) return null;
  return roundGrade(values.reduce((total, score) => total + score, 0) / values.length);
}

function overallMfd(summary: OfficialPautaSummary | undefined): number | null {
  if (!summary?.isComplete) return null;
  const values = summary.subjects
    .map((subject) => subject.mfd)
    .filter((score): score is number => score !== null);
  if (values.length === 0) return null;
  return roundGrade(values.reduce((total, score) => total + score, 0) / values.length);
}

/** Constrói a pauta de exame/PAP exclusivamente a partir dos itens e notas já registados. */
export function buildExamPautaStudents({
  enrollments,
  items,
  scores,
  officialSummaries,
  subjectId,
  isTechnical,
  passingGrade = 10,
}: {
  enrollments: ExamEnrollment[];
  items: ExamAssessmentItem[];
  scores: ExamAssessmentScore[];
  officialSummaries: Map<string, OfficialPautaSummary>;
  subjectId: string;
  isTechnical: boolean;
  passingGrade?: number;
}): ExamPautaStudent[] {
  const relevantComponents = isTechnical
    ? new Set(["pap", "estagio", "exame"])
    : new Set(["exame", "recurso"]);
  if (!items.some((item) => relevantComponents.has(String(item.component)))) return [];

  return enrollments.map((enrollment, index) => {
    const official = officialSummaries.get(enrollment.id);
    const subjectMfd =
      official?.subjects.find((subject) => subject.subjectId === subjectId)?.mfd ?? null;
    const mfd = isTechnical ? overallMfd(official) : subjectMfd;
    const examGrade = componentAverage("exame", enrollment.id, items, scores);
    const resourceGrade = componentAverage("recurso", enrollment.id, items, scores);
    const explicitPapGrade = componentAverage("pap", enrollment.id, items, scores);
    const papGrade = isTechnical ? (explicitPapGrade ?? examGrade) : null;
    const internshipGrade = isTechnical
      ? componentAverage("estagio", enrollment.id, items, scores)
      : null;

    let finalGrade: number | null = null;
    let status: StudentStatus = "";

    if (isTechnical) {
      if (mfd !== null && papGrade !== null && internshipGrade !== null) {
        finalGrade = roundGrade((mfd + papGrade + internshipGrade) / 3);
        status =
          finalGrade >= passingGrade && papGrade >= passingGrade && internshipGrade >= passingGrade
            ? "APTO (PAP)"
            : "NÃO APTO (PAP)";
      }
    } else if (mfd !== null && examGrade !== null) {
      finalGrade = calculateExamFinalGrade(mfd, examGrade, 0.6, 1);
      status = finalGrade !== null && finalGrade >= passingGrade ? "APROVADO" : "REPROVADO";
    } else if (mfd !== null && resourceGrade !== null) {
      const recoveredGrade = recursoFinal(mfd, resourceGrade);
      if (recoveredGrade !== null) {
        finalGrade = roundGrade(recoveredGrade);
        status = finalGrade >= passingGrade ? "APROVADO" : "REPROVADO";
      }
    }

    return {
      id: enrollment.id,
      code: enrollment.registration_number ?? `EST-${index + 1}`,
      number: index + 1,
      name: enrollment.student_name,
      gender: toGender(enrollment.student_gender),
      mfd,
      examGrade: isTechnical ? null : examGrade,
      resourceGrade: isTechnical ? null : resourceGrade,
      papGrade,
      internshipGrade,
      finalGrade,
      status,
      observation: finalGrade === null ? "Dados finais incompletos." : "",
    };
  });
}
