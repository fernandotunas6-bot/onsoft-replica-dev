import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  loadSchoolAdminAccessSnapshot,
  repairSchoolAdminAccess,
} from "@/features/saas/school-admin-access";
import {
  assessSchoolAdminAccess,
  schoolAdminAccessReady,
  type SchoolAdminAccessIssue,
} from "@/features/saas/school-admin-access-rules";
import { buildSetupSteps, summarizeSetup } from "@/features/school/setup-steps";
import { loadSchoolSetupSnapshot } from "@/features/school/setup-status";

/**
 * Página «Onde deseja começar?» do administrador da escola
 * (`/configuracoes/boas-vindas`): o estado do acesso, em três passos, e o
 * progresso do assistente de configuração. Só o administrador da escola; só a
 * escola e a conta da sessão.
 */
export type AdminWelcomeStatus = {
  schoolName: string;
  tenantSlug: string;
  /** Escola, administrador e vínculo verificados. */
  created: { ok: boolean; issues: SchoolAdminAccessIssue[] };
  /** Conta, 2FA, escola activa e permissões. */
  access: {
    ok: boolean;
    emailConfirmed: boolean;
    twoFactorEnrolled: boolean;
    sessionTwoFactor: boolean;
    schoolActive: boolean;
    permissions: boolean;
    issues: SchoolAdminAccessIssue[];
  };
  /** Há correcções automáticas por aplicar à própria conta. */
  canSelfRepair: boolean;
  setup: ReturnType<typeof summarizeSetup> | null;
};

const CREATION_CODES = new Set<SchoolAdminAccessIssue["code"]>([
  "school_missing",
  "no_admin",
  "account_missing",
  "profile_missing",
  "profile_without_school",
]);

export const getAdminWelcomeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminWelcomeStatus> => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const snapshot = await loadSchoolAdminAccessSnapshot(db, { schoolId: membership.schoolId });
    if (!snapshot) throw new Error("Escola não encontrada.");

    // Os problemas de outros administradores não são desta conta: cada um vê os seus.
    const issues = assessSchoolAdminAccess(snapshot).filter(
      (issue) => !issue.userId || issue.userId === context.userId,
    );
    const me = snapshot.admins.find((admin) => admin.userId === context.userId);
    const has = (code: SchoolAdminAccessIssue["code"]) => issues.some((i) => i.code === code);

    const sessionTwoFactor = context.claims["aal"] === "aal2";
    let setup: AdminWelcomeStatus["setup"] = null;
    try {
      const setupSnapshot = await loadSchoolSetupSnapshot(
        db,
        membership.schoolId,
        context.userId,
        sessionTwoFactor,
      );
      setup = summarizeSetup(buildSetupSteps(setupSnapshot));
    } catch {
      // O progresso é informativo: sem ele a página continua útil.
    }

    const createdIssues = issues.filter((issue) => CREATION_CODES.has(issue.code));
    const accessIssues = issues.filter((issue) => !CREATION_CODES.has(issue.code));
    return {
      schoolName: snapshot.school?.name ?? snapshot.tenant.name,
      tenantSlug: snapshot.tenant.slug,
      created: {
        ok: !createdIssues.some((issue) => issue.severity === "blocker"),
        issues: createdIssues,
      },
      access: {
        ok: schoolAdminAccessReady(accessIssues),
        emailConfirmed: !has("email_unconfirmed"),
        twoFactorEnrolled: (me?.verifiedFactors ?? 0) > 0,
        sessionTwoFactor,
        schoolActive: !has("tenant_blocked") && !has("trial_expired") && !has("school_archived"),
        permissions: Boolean(me) && !has("role_without_permissions"),
        issues: accessIssues,
      },
      canSelfRepair: issues.some((issue) => issue.fix === "auto"),
      setup,
    };
  });

/** Aplica à própria conta as correcções automáticas (perfil, permissões do papel). */
export const repairOwnAdminAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const result = await repairSchoolAdminAccess(
      db,
      { schoolId: membership.schoolId },
      { onlyUserId: context.userId },
    );
    return { actions: result.actions };
  });

/**
 * Que ambientes esta conta pode abrir. O seletor de ambientes só aparece a
 * quem administra: a escola (Administrador) ou a plataforma (`platform_admins`).
 * Ser administrador da escola nunca dá a Administração Global.
 */
export const getEnvironmentAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId).catch(() => null);
    const db = await loadSgaAdminClient();
    const { data } = await db
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      isSchoolAdmin: Boolean(membership?.allAppRoles?.includes("Administrador")),
      isPlatformAdmin: Boolean(data),
    };
  });
