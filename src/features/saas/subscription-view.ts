/**
 * Leitura da assinatura para o ecrã "Assinatura e plano". Funções puras.
 */
export type SubscriptionTone = "success" | "warning" | "danger" | "info" | "muted";

export type SubscriptionState = {
  label: string;
  detail: string;
  tone: SubscriptionTone;
  /** 0–1 do período experimental já passado; null fora do período. */
  trialProgress: number | null;
};

const DAY = 24 * 60 * 60 * 1000;
/** Duração por omissão do período experimental (ver trial_days no registo). */
const TRIAL_DAYS = 14;

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });

export function describeSubscription(
  data: {
    status: string;
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
    periodEnd: string | null;
  },
  now: Date,
): SubscriptionState {
  const sub = data.subscriptionStatus ?? "";
  const status = data.status;

  if (status === "suspended" || sub === "unpaid") {
    return {
      label: "Suspensa",
      detail: "O acesso está limitado. Regularize o pagamento para reactivar a escola.",
      tone: "danger",
      trialProgress: null,
    };
  }
  if (status === "cancelled" || status === "archived" || sub === "canceled") {
    return {
      label: "Cancelada",
      detail: "A assinatura foi cancelada. Fale com a equipa para a reactivar.",
      tone: "muted",
      trialProgress: null,
    };
  }
  if (sub === "past_due" || status === "past_due") {
    return {
      label: "Pagamento em atraso",
      detail: "Envie o comprovativo para evitar a suspensão.",
      tone: "warning",
      trialProgress: null,
    };
  }
  if ((status === "trial" || sub === "trialing") && data.trialEndsAt) {
    const end = new Date(data.trialEndsAt).getTime();
    const left = Math.ceil((end - now.getTime()) / DAY);
    if (left <= 0) {
      return {
        label: "Período experimental terminou",
        detail: "Envie o comprovativo de pagamento para continuar sem interrupções.",
        tone: "warning",
        trialProgress: 1,
      };
    }
    const elapsed = TRIAL_DAYS - Math.min(left, TRIAL_DAYS);
    return {
      label: "Período experimental",
      detail: `${left === 1 ? "Falta 1 dia" : `Faltam ${left} dias`}, até ${longDate(data.trialEndsAt)}. O pagamento só é pedido no fim.`,
      tone: left <= 3 ? "warning" : "info",
      trialProgress: Math.max(0, Math.min(1, elapsed / TRIAL_DAYS)),
    };
  }
  if (status === "active" || sub === "active") {
    return {
      label: "Activa",
      detail: data.periodEnd
        ? `Período pago até ${longDate(data.periodEnd)}.`
        : "Assinatura em dia.",
      tone: "success",
      trialProgress: null,
    };
  }
  return {
    label: "Em preparação",
    detail: "A escola está a ser configurada. Se isto demorar, fale com o suporte.",
    tone: "muted",
    trialProgress: null,
  };
}

/** Fracção usada do limite; null quando o plano não tem limite. */
export function usageShare(used: number, limit: number | null): number | null {
  if (!limit || limit <= 0) return null;
  return Math.max(0, used / limit);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}
