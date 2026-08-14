const FIELD_LABELS: Record<string, string> = {
  mac: "MAC",
  npp: "NPP",
  npt: "NPT",
  score: "Nota",
  average: "Média",
  amount: "Valor",
  discountAmount: "Desconto",
  reason: "Motivo",
  phone: "Telemóvel",
  email: "E-mail",
  fullName: "Nome completo",
};

type ZodLikeIssue = {
  code?: unknown;
  message?: unknown;
  path?: unknown;
  maximum?: unknown;
  minimum?: unknown;
};

function fieldLabel(path: unknown): string | null {
  if (!Array.isArray(path) || !path.length) return null;
  const key = String(path[path.length - 1]);
  return FIELD_LABELS[key] ?? key;
}

function describeIssue(issue: ZodLikeIssue): string {
  const label = fieldLabel(issue.path);
  if (issue.code === "too_big" && typeof issue.maximum === "number") {
    return label
      ? `${label} deve ser no máximo ${issue.maximum}.`
      : `Valor deve ser no máximo ${issue.maximum}.`;
  }
  if (issue.code === "too_small" && typeof issue.minimum === "number") {
    return label
      ? `${label} deve ser no mínimo ${issue.minimum}.`
      : `Valor deve ser no mínimo ${issue.minimum}.`;
  }
  if (typeof issue.message === "string" && issue.message) {
    return label ? `${label}: ${issue.message}` : issue.message;
  }
  return "Valor inválido.";
}

/**
 * Erros de validação (zod) atravessam a fronteira do createServerFn como um
 * array JSON em error.message — sem isto, o utilizador via o JSON em bruto
 * (ex.: `[{"code":"too_big","maximum":20,...}]`) em vez de "NPP deve ser no
 * máximo 20."
 */
export function formatMutationError(error: unknown, fallback = "Tente novamente."): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const message = error.message.trim();
  if (message.startsWith("[") || message.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(message);
      const issues = Array.isArray(parsed) ? parsed : [parsed];
      if (issues.length && issues.every((item) => item && typeof item === "object")) {
        const described = issues.map((issue) => describeIssue(issue as ZodLikeIssue));
        if (described.length) return described.join(" ");
      }
    } catch {
      // Não era JSON — usa a mensagem tal como veio.
    }
  }
  return message;
}
