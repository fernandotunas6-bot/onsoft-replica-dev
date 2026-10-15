/**
 * Acesso do administrador de uma escola: o que tem de ser verdade para ele
 * entrar e configurar a escola, e o que falta quando não entra.
 *
 * Só regras puras. Os dados vêm de `loadSchoolAdminAccessSnapshot`
 * (school-admin-access.ts), que os lê na base com a chave de serviço. Fica à
 * parte para ser testável e para a página de boas-vindas importar os tipos sem
 * arrastar código de servidor.
 *
 * Três ambientes, uma conta (decisão do dono, 2026-10-15):
 * - Administração Global (ADMIN): só `platform_admins`. Nada aqui a concede.
 * - Administração Institucional (SIGA, papel Administrador): o director da escola.
 * - Portal Escolar (SIGA, gestão académica): o mesmo login, sem segunda conta.
 */

import { getTenantAccessBlock, type TenantAccessBlockReason } from "@/features/saas/tenant-access";
import type { SubscriptionLifecycle, TenantStatus } from "@/features/saas/types";

/** Códigos de papel que fazem de alguém administrador da escola. */
export const SCHOOL_ADMIN_ROLE_CODES = ["owner", "admin"] as const;

export type SchoolAdminAccountSnapshot = {
  userId: string;
  email: string | null;
  roleCodes: string[];
  /** Permissões (role_permissions) do papel de administrador com mais permissões. */
  rolePermissions: number;
  /** A conta existe no Supabase Auth. */
  accountExists: boolean;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  hasProfile: boolean;
  profileSchoolId: string | null;
  /** Factores 2FA verificados (TOTP ou chave de acesso). */
  verifiedFactors: number;
};

export type SchoolAdminAccessSnapshot = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
    subscription_status: SubscriptionLifecycle | null;
    trial_ends_at: string | null;
  };
  school: { id: string; name: string; status: string | null } | null;
  admins: SchoolAdminAccountSnapshot[];
};

export type SchoolAdminAccessIssueCode =
  | "school_missing"
  | "school_archived"
  | "tenant_blocked"
  | "trial_expired"
  | "no_admin"
  | "account_missing"
  | "account_banned"
  | "email_unconfirmed"
  | "role_without_permissions"
  | "profile_missing"
  | "profile_without_school"
  | "never_signed_in"
  | "mfa_missing";

/**
 * Como se resolve cada problema:
 * - `auto`: a reparação faz sozinha, sem decidir nada por ninguém.
 * - `access_link`: gerar um link de definição de senha e entregá-lo.
 * - `subscription`: estender o trial ou activar o plano (ADMIN → Gerir).
 * - `user`: o próprio administrador (ex.: activar o 2FA).
 * - `manual`: decisão de quem opera a plataforma.
 */
export type SchoolAdminAccessFix = "auto" | "access_link" | "subscription" | "user" | "manual";

export type SchoolAdminAccessIssue = {
  code: SchoolAdminAccessIssueCode;
  /** `blocker` impede entrar ou configurar; `warning` atrapalha; `info` é recomendação. */
  severity: "blocker" | "warning" | "info";
  fix: SchoolAdminAccessFix;
  message: string;
  userId?: string;
  email?: string | null;
};

const BLOCK_MESSAGES: Record<TenantAccessBlockReason, string> = {
  suspended: "A assinatura está suspensa: a escola só pode ser consultada.",
  cancelled: "A assinatura foi cancelada: a escola só pode ser consultada.",
  trial_expired:
    "O período experimental terminou: o administrador entra, mas não consegue gravar a configuração.",
};

function isBanned(bannedUntil: string | null, now: Date): boolean {
  if (!bannedUntil) return false;
  const until = new Date(bannedUntil);
  return !Number.isNaN(until.getTime()) && until > now;
}

/** Problemas de acesso de uma escola, pela ordem em que se resolvem. */
export function assessSchoolAdminAccess(
  snapshot: SchoolAdminAccessSnapshot,
  now: Date = new Date(),
): SchoolAdminAccessIssue[] {
  const issues: SchoolAdminAccessIssue[] = [];
  const { tenant, school, admins } = snapshot;

  if (!school) {
    issues.push({
      code: "school_missing",
      severity: "blocker",
      fix: "manual",
      message: "O tenant não tem escola: o provisionamento não chegou ao fim.",
    });
    return issues;
  }
  if (school.status === "archived") {
    issues.push({
      code: "school_archived",
      severity: "blocker",
      fix: "manual",
      message: "A escola está arquivada.",
    });
  }

  const block = getTenantAccessBlock(
    {
      status: tenant.status,
      subscription_status: tenant.subscription_status ?? undefined,
      trial_ends_at: tenant.trial_ends_at,
    },
    now,
  );
  if (block.blocked) {
    const reason = block.reason ?? "suspended";
    issues.push({
      code: reason === "trial_expired" ? "trial_expired" : "tenant_blocked",
      severity: "blocker",
      fix: "subscription",
      message: BLOCK_MESSAGES[reason],
    });
  }

  if (admins.length === 0) {
    issues.push({
      code: "no_admin",
      severity: "blocker",
      fix: "manual",
      message: "Nenhuma conta activa tem o papel de administrador desta escola.",
    });
    return issues;
  }

  for (const admin of admins) {
    const who = { userId: admin.userId, email: admin.email };
    if (!admin.accountExists) {
      issues.push({
        ...who,
        code: "account_missing",
        severity: "blocker",
        fix: "manual",
        message: "O vínculo aponta para uma conta que já não existe.",
      });
      continue;
    }
    if (isBanned(admin.bannedUntil, now)) {
      issues.push({
        ...who,
        code: "account_banned",
        severity: "blocker",
        fix: "manual",
        message: "A conta do administrador está bloqueada no serviço de identidade.",
      });
    }
    if (!admin.emailConfirmed) {
      issues.push({
        ...who,
        code: "email_unconfirmed",
        severity: "blocker",
        fix: "auto",
        message: "O e-mail do administrador não está confirmado: a entrada com senha é recusada.",
      });
    }
    if (admin.rolePermissions === 0) {
      issues.push({
        ...who,
        code: "role_without_permissions",
        severity: "blocker",
        fix: "auto",
        message:
          "O papel de administrador não tem permissões: a conta entra e não consegue gravar.",
      });
    }
    if (!admin.hasProfile) {
      issues.push({
        ...who,
        code: "profile_missing",
        severity: "warning",
        fix: "auto",
        message: "A conta não tem perfil: entra sem nome nem cargo.",
      });
    } else if (!admin.profileSchoolId) {
      issues.push({
        ...who,
        code: "profile_without_school",
        severity: "warning",
        fix: "auto",
        message: "O perfil não indica escola.",
      });
    }
    if (!admin.lastSignInAt) {
      issues.push({
        ...who,
        code: "never_signed_in",
        severity: "warning",
        fix: "access_link",
        message:
          "O administrador nunca entrou. Se não conhece a senha, gere um link de acesso e entregue-lho.",
      });
    }
    if (admin.verifiedFactors === 0) {
      issues.push({
        ...who,
        code: "mfa_missing",
        severity: "info",
        fix: "user",
        message: "Sem verificação em dois passos: o SIGA pede-a antes de gravar dados sensíveis.",
      });
    }
  }

  return issues;
}

/** A escola está pronta para o administrador entrar e configurar. */
export function schoolAdminAccessReady(issues: SchoolAdminAccessIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "blocker");
}
