/**
 * Vinculação institucional — regras puras, sem I/O.
 *
 * Uma identidade (auth.users) é única; os vínculos a escolas são muitos, cada
 * um com o seu papel (`school_memberships` + `member_roles`). Este módulo
 * decide, sem tocar na base:
 *   - em que situação está uma conta autenticada (com vínculo / sem vínculo);
 *   - que transições de estado um pedido de acesso admite;
 *   - que papéis cada perfil pedido pode receber e quem os pode conceder.
 * Quem chama (servidor) continua obrigado a validar a autorização real.
 */
import type { ApplicationRole } from "@/features/auth/access-policy";

export const accessRequestProfiles = [
  "aluno",
  "professor",
  "funcionario",
  "encarregado",
  "outro",
] as const;
export type AccessRequestProfile = (typeof accessRequestProfiles)[number];

export const accessRequestStatuses = [
  "pending",
  "in_review",
  "info_requested",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type AccessRequestStatus = (typeof accessRequestStatuses)[number];

export const OPEN_ACCESS_REQUEST_STATUSES: readonly AccessRequestStatus[] = [
  "pending",
  "in_review",
  "info_requested",
];

export const accessRequestProfileLabels: Record<AccessRequestProfile, string> = {
  aluno: "Aluno",
  professor: "Docente",
  funcionario: "Funcionário",
  encarregado: "Encarregado de educação",
  outro: "Outro perfil",
};

export const accessRequestStatusLabels: Record<AccessRequestStatus, string> = {
  pending: "Pendente",
  in_review: "Em análise",
  info_requested: "Informações adicionais solicitadas",
  approved: "Aprovado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
};

/** Rótulo do identificador institucional pedido para cada perfil. */
export const institutionalNumberLabels: Record<AccessRequestProfile, string> = {
  aluno: "Número de aluno",
  professor: "Número de funcionário / docente",
  funcionario: "Número de funcionário",
  encarregado: "Número de aluno do educando",
  outro: "Identificador institucional (se tiver)",
};

export function isOpenAccessRequest(status: AccessRequestStatus): boolean {
  return OPEN_ACCESS_REQUEST_STATUSES.includes(status);
}

// ─── Situação da conta ──────────────────────────────────────────────────────

export type AccountLinkSituation =
  /** Tem pelo menos um vínculo activo: abrir o painel (ou escolher escola). */
  | "linked"
  /** Conta autenticada sem nenhum vínculo activo: painel de boas-vindas. */
  | "unlinked";

export function classifyAccountLink(
  memberships: ReadonlyArray<{ isActive: boolean }> | null | undefined,
): AccountLinkSituation {
  return (memberships ?? []).some((m) => m.isActive) ? "linked" : "unlinked";
}

// ─── Máquina de estados do pedido ───────────────────────────────────────────

export type ReviewerAction = "start_review" | "request_info" | "approve" | "reject";
export type RequesterAction = "cancel" | "reply";
export type AccessRequestAction = ReviewerAction | RequesterAction;

const transitions: Record<
  AccessRequestAction,
  Partial<Record<AccessRequestStatus, AccessRequestStatus>>
> = {
  start_review: { pending: "in_review" },
  request_info: { pending: "info_requested", in_review: "info_requested" },
  approve: { pending: "approved", in_review: "approved", info_requested: "approved" },
  reject: { pending: "rejected", in_review: "rejected", info_requested: "rejected" },
  cancel: { pending: "cancelled", in_review: "cancelled", info_requested: "cancelled" },
  // A resposta do requerente devolve o pedido à fila da secretaria.
  reply: { info_requested: "pending" },
};

/** Estado seguinte, ou `null` quando a acção não é permitida no estado actual. */
export function nextAccessRequestStatus(
  current: AccessRequestStatus,
  action: AccessRequestAction,
): AccessRequestStatus | null {
  return transitions[action][current] ?? null;
}

// ─── Papéis que uma aprovação pode conceder ─────────────────────────────────

/**
 * Papéis admissíveis para cada perfil pedido. Nunca inclui "Administrador":
 * o controlo total de uma escola não se obtém por pedido de acesso.
 */
export const grantableRolesByProfile: Record<AccessRequestProfile, ApplicationRole[]> = {
  aluno: ["Aluno"],
  encarregado: ["Encarregado"],
  professor: ["Professor"],
  funcionario: ["Secretaria", "Tesouraria"],
  outro: ["Encarregado", "Aluno", "Professor", "Secretaria", "Tesouraria"],
};

export function defaultRoleForProfile(profile: AccessRequestProfile): ApplicationRole {
  return grantableRolesByProfile[profile][0]!;
}

/** Papéis de pessoal: só um Administrador os concede, não a Secretaria. */
const STAFF_ROLES: readonly ApplicationRole[] = ["Secretaria", "Tesouraria"];

export type GrantDecision = { ok: true } | { ok: false; reason: string };

export function canGrantRole(
  reviewerRole: ApplicationRole,
  profile: AccessRequestProfile,
  role: ApplicationRole,
): GrantDecision {
  if (reviewerRole !== "Administrador" && reviewerRole !== "Secretaria") {
    return {
      ok: false,
      reason: "Apenas a Administração e a Secretaria decidem pedidos de acesso.",
    };
  }
  if (!grantableRolesByProfile[profile].includes(role)) {
    return {
      ok: false,
      reason: `O papel ${role} não é admissível para um pedido de ${accessRequestProfileLabels[profile]}.`,
    };
  }
  if (STAFF_ROLES.includes(role) && reviewerRole !== "Administrador") {
    return {
      ok: false,
      reason: "Só um Administrador pode conceder papéis de pessoal administrativo.",
    };
  }
  return { ok: true };
}

/** Códigos que um pedido de acesso pode conceder: nunca o de proprietário. */
export function grantableRoleCodes(roleCodes: string[]): string[] {
  return roleCodes.filter((code) => code !== "owner");
}

/** Escolhe o papel pela ordem de preferência dos códigos. */
export function pickRoleByPreference<T extends { id: unknown; code: unknown }>(
  roles: T[],
  codes: string[],
): T | null {
  for (const code of codes) {
    const found = roles.find((r) => r.code === code && r.id);
    if (found) return found;
  }
  return null;
}

// ─── Normalização dos dados de identificação ────────────────────────────────

/** Compacta um identificador para comparação (maiúsculas, sem espaços/pontuação). */
export function compactIdentifier(value: string | null | undefined): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

/**
 * Um cadastro só é associado ao pedido quando DOIS factores coincidem na mesma
 * escola: o identificador institucional e o B.I. Um só factor (ou o nome) não
 * chega — é informação que terceiros podem conhecer.
 */
export function isSafeRecordMatch(input: {
  requestedNumber: string | null | undefined;
  requestedNationalId: string | null | undefined;
  recordNumbers: ReadonlyArray<string | null | undefined>;
  recordNationalId: string | null | undefined;
}): boolean {
  const number = compactIdentifier(input.requestedNumber);
  const nationalId = compactIdentifier(input.requestedNationalId);
  if (number.length < 2 || nationalId.length < 5) return false;
  if (compactIdentifier(input.recordNationalId) !== nationalId) return false;
  return input.recordNumbers.some((candidate) => compactIdentifier(candidate) === number);
}
