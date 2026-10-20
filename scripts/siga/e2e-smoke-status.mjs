/**
 * A aprovação do smoke test só vale para o estado realmente observado.
 * Em CI sem base configurada, HTTP 500 de API é ignorado (NUNCA aprovado).
 * Um PayFlow opcional com HTTP 503 não prova funcionamento do serviço.
 */
export function classifySmokeStatus({ label, expected, status, ci, optionalInCi = false }) {
  if (optionalInCi && status === 503) return "skip";
  if (expected.includes(status)) return "pass";
  if (ci && label.startsWith("API") && status === 500) return "skip";
  return "fail";
}
