import { useQuery } from "@tanstack/react-query";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { angolaGradeScale } from "@/lib/angola-academic";
import { getActivePassingValue } from "./assessment-models";

/**
 * Nota mínima de aprovação para os ecrãs: a do modelo de avaliação em vigor
 * (a mesma da pauta oficial); sem modelo, a das Definições da escola; sem
 * nenhuma, a da escala angolana (Decreto 424/25).
 */
export function usePassingValue(): number {
  const { school } = useSchoolSettings();
  const query = useQuery({
    queryKey: ["academic", "passing-value"],
    queryFn: () => getActivePassingValue(),
    staleTime: 10 * 60 * 1000,
  });
  return query.data?.passingValue ?? school?.passing_grade ?? angolaGradeScale.passing;
}
