import type { Plan } from "@/features/saas/types";
import { accessModules } from "@/features/auth/access-policy";

type ModuleKey = (typeof accessModules)[number]["key"];

const MODULE_FEATURE: Partial<Record<ModuleKey, keyof NonNullable<Plan["features"]>>> = {
  financeiro: "finance",
  pedagogica: "academic",
  pessoas: "academic",
  arquivos: "academic",
  importacao: "academic",
};

function moduleKeyForPath(pathname: string): ModuleKey | null {
  const matches = accessModules.flatMap((item) =>
    item.prefixes
      .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
      .map((prefix) => ({ key: item.key, prefix })),
  );
  if (!matches.length) return null;
  matches.sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0]?.key ?? null;
}

/** Sem plano carregado (modo escola única) → tudo permitido. */
export function planIncludesModule(
  plan: Plan | null | undefined,
  moduleKey: ModuleKey,
): boolean {
  const feature = MODULE_FEATURE[moduleKey];
  if (!feature) return true;
  if (!plan?.features) return true;
  return Boolean(plan.features[feature]);
}

export function planIncludesPath(pathname: string, plan: Plan | null | undefined): boolean {
  const moduleKey = moduleKeyForPath(pathname);
  if (!moduleKey) return true;
  return planIncludesModule(plan, moduleKey);
}

export function trialDaysRemaining(trialEndsAt: string | null | undefined, now = new Date()): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function planIncludesCustomDomain(plan: Plan | null | undefined): boolean {
  if (!plan) return true; // Modo demo / dev
  return Boolean(plan.features?.custom_domain || plan.code === "business" || plan.code === "enterprise");
}

export function planIncludesProfessionalEmail(plan: Plan | null | undefined): boolean {
  if (!plan) return true;
  return Boolean(plan.code === "business" || plan.code === "enterprise");
}

export function planIncludesAdvancedBranding(plan: Plan | null | undefined): boolean {
  if (!plan) return true;
  return Boolean(plan.code === "enterprise" || plan.features?.custom_domain);
}
