import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRecentVerification } from "@/lib/step-up";
import { LOGIN_MFA_PREFERENCE_KEY, isLoginMfaEnabled } from "./login-mfa-policy";
import { clearSessionMfaCache } from "@/integrations/supabase/session-mfa";

/** Preferência da identidade, não da escola: cobre todos os portais da conta. */
export const setLoginMfaPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    requireRecentVerification(context.claims, "alterar a confirmação no início de sessão");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (userError || !existing.user) throw new Error("Não foi possível confirmar a sua conta.");

    const original = existing.user.app_metadata ?? {};
    if (isLoginMfaEnabled(original) === data.enabled) return { enabled: data.enabled };

    if (data.enabled) {
      const { data: factors, error: factorsError } = await supabaseAdmin.auth.admin.mfa.listFactors(
        {
          userId: context.userId,
        },
      );
      if (factorsError) throw new Error("Não foi possível confirmar os factores de segurança.");
      if (!factors?.factors.some((factor) => factor.status === "verified")) {
        throw new Error(
          "Configure e confirme uma aplicação autenticadora ou chave de acesso primeiro.",
        );
      }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      app_metadata: { ...original, [LOGIN_MFA_PREFERENCE_KEY]: data.enabled },
    });
    if (error) throw new Error("Não foi possível guardar a preferência de segurança.");
    clearSessionMfaCache();
    return { enabled: data.enabled };
  });
