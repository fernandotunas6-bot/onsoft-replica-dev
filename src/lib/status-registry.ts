/**
 * Registo único de estados do SIGA (§43 da especificação mobile).
 *
 * Antes cada ecrã escolhia a sua cor e o seu rótulo: o mesmo "pendente"
 * aparecia âmbar num sítio, cinzento noutro, e "overdue" tinha três traduções.
 * Um estado novo entra aqui — nunca num `className` solto — e passa a ter
 * rótulo, tom e ícone iguais em toda a aplicação.
 *
 * Os tons referem-se a tokens (`--success`, `--warning`, …), nunca a cores
 * cruas do Tailwind: é o que mantém o tema escuro coerente sem trabalho extra.
 */
export type StatusTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export type StatusKey =
  | "active"
  | "inactive"
  | "pending"
  | "approved"
  | "rejected"
  | "overdue"
  | "paid"
  | "partial"
  | "cancelled"
  | "processing"
  | "refunded"
  | "candidate"
  | "debt"
  | "failed"
  | "draft"
  | "closed"
  | "suspended"
  | "transferred"
  | "graduated";

export type StatusDefinition = {
  /** Rótulo em português europeu, como a escola o diz. */
  label: string;
  tone: StatusTone;
  /** Frase curta para leitores de ecrã e tooltips, quando o rótulo não basta. */
  hint?: string;
};

export const STATUS_REGISTRY: Record<StatusKey, StatusDefinition> = {
  active: { label: "Activo", tone: "success" },
  inactive: { label: "Inactivo", tone: "neutral" },
  pending: { label: "Pendente", tone: "warning", hint: "À espera de acção" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  overdue: { label: "Em atraso", tone: "danger", hint: "Prazo ultrapassado" },
  paid: { label: "Pago", tone: "success" },
  partial: { label: "Pago em parte", tone: "warning" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  processing: { label: "Em processamento", tone: "info" },
  refunded: { label: "Reembolsado", tone: "info" },
  candidate: { label: "Candidato", tone: "primary" },
  debt: { label: "Com dívida", tone: "danger" },
  failed: { label: "Falhado", tone: "danger" },
  draft: { label: "Rascunho", tone: "neutral" },
  closed: { label: "Fechado", tone: "neutral" },
  suspended: { label: "Suspenso", tone: "warning" },
  transferred: { label: "Transferido", tone: "info" },
  graduated: { label: "Concluído", tone: "primary" },
};

/**
 * Sinónimos que vêm da base de dados ou de APIs externas. Mapeados para a
 * chave canónica em vez de duplicar definições.
 */
const ALIASES: Record<string, StatusKey> = {
  activo: "active",
  ativo: "active",
  enrolled: "active",
  inactivo: "inactive",
  inativo: "inactive",
  pendente: "pending",
  awaiting: "pending",
  aprovado: "approved",
  recusado: "rejected",
  atraso: "overdue",
  late: "overdue",
  pago: "paid",
  parcial: "partial",
  cancelado: "cancelled",
  applicant: "candidate",
  candidato: "candidate",
  divida: "debt",
  suspenso: "suspended",
  transferido: "transferred",
  concluido: "graduated",
  completed: "graduated",
};

export function resolveStatus(status: string): StatusDefinition & { key: StatusKey | null } {
  const raw = String(status ?? "")
    .toLowerCase()
    .trim();
  const key = (raw in STATUS_REGISTRY ? (raw as StatusKey) : ALIASES[raw]) ?? null;
  if (key) return { ...STATUS_REGISTRY[key], key };
  return { label: status || "—", tone: "neutral", key: null };
}

/**
 * Classes por tom. Fundo suave, texto na variante "strong" (contraste AA),
 * borda ténue — a regra do §5: nunca um fundo saturado numa área grande.
 */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary-soft text-primary-strong border-primary/20",
  success: "bg-success/10 text-success-strong border-success/25",
  warning: "bg-warning/15 text-warning-strong border-warning/30",
  danger: "bg-destructive/10 text-destructive-strong border-destructive/25",
  info: "bg-info/10 text-info-strong border-info/25",
};

export const STATUS_DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
};
