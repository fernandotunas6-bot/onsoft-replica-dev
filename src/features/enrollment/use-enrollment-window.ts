import { useQuery } from "@tanstack/react-query";
import type { QuickField } from "@/components/modals/QuickFormModal";
import { getEnrollmentWindowStatus } from "./server";

export const ENROLLMENT_WINDOW_QUERY_KEY = ["enrollment", "window"] as const;

/** Campo do motivo de uma matrícula fora do ciclo (só a Administração o vê). */
export const OUTSIDE_CYCLE_FIELD = "motivoCiclo";

/**
 * Estado das matrículas hoje: ciclo aberto ou fechado (período de aulas). Fora do
 * ciclo, a Administração vê o campo do motivo; a Secretaria vê a razão da recusa.
 * Mudar de turma não é matrícula nova e não depende disto.
 */
export function useEnrollmentWindow() {
  const query = useQuery({
    queryKey: ENROLLMENT_WINDOW_QUERY_KEY,
    queryFn: () => getEnrollmentWindowStatus(),
    staleTime: 5 * 60 * 1000,
  });
  const status = query.data;
  const closed = Boolean(status && !status.open);
  const reasonField: QuickField | null =
    closed && status?.canOverride
      ? {
          name: OUTSIDE_CYCLE_FIELD,
          label: "Motivo da matrícula fora do ciclo",
          type: "textarea",
          placeholder: "Ex.: transferência de outra escola autorizada pela direcção",
          required: true,
          full: true,
        }
      : null;
  return {
    status,
    closed,
    /** Fora do ciclo e sem permissão para a excepção. */
    blocked: closed && !status?.canOverride,
    reasonField,
  };
}
