/**
 * A aprovação do smoke test só vale para o estado realmente observado.
 * Só quando a ausência de staging foi declarada, HTTP 500 de API vira SKIP.
 * Um PayFlow opcional com HTTP 503 não prova funcionamento do serviço.
 */
export function classifySmokeStatus({
  label,
  expected,
  status,
  allowApi500Skip = false,
  ci = false,
  optionalInCi = false,
}) {
  if (optionalInCi && status === 503) return ci ? "skip" : "fail";
  if (expected.includes(status)) return "pass";
  if (allowApi500Skip && label.startsWith("API") && status === 500) return "skip";
  return "fail";
}
