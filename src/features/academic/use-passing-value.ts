import { useQuery } from "@tanstack/react-query";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { angolaGradeScale } from "@/lib/angola-academic";
import { DEFAULT_PROMOTION_RULES, type PromotionRules } from "./assessment-model";
import { getActivePassingValue } from "./assessment-models";

/**
 * Nota mínima de aprovação para os ecrãs: a do modelo de avaliação em vigor
 * (a mesma da pauta oficial); sem modelo, a das Definições da escola; sem
 * nenhuma, a da escala angolana (Decreto 424/25).
 */
export function usePassingValue(): number {
  return useActiveAssessmentRule().passing;
}

/** Nota de aprovação e regras de transição por ciclo do modelo em vigor. */
export function useActiveAssessmentRule(): {
  passing: number;
  promotionRules: PromotionRules;
  /** `false` só quando se sabe que a escola não tem modelo publicado. */
  hasModel: boolean;
} {
  const { school } = useSchoolSettings();
  const query = useQuery({
    queryKey: ["academic", "passing-value"],
    queryFn: () => getActivePassingValue(),
    staleTime: 10 * 60 * 1000,
  });
  return {
    passing: query.data?.passingValue ?? school?.passing_grade ?? angolaGradeScale.passing,
    promotionRules: query.data?.promotionRules ?? DEFAULT_PROMOTION_RULES,
    // Sem modelo, os ecrãs mostram "Transita" com o limiar das Definições, mas
    // o servidor recusa abrir diários e gerar pautas: é preciso avisar.
    hasModel: !query.isSuccess || query.data.passingValue != null,
  };
}
