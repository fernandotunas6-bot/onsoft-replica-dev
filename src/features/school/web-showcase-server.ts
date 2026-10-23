/**
 * Vitrine do site SIGA Plus: a escola decide se aparece em «Escolas que usam o SIGA
 * Plus» (painel/web). Só o Administrador da escola muda a escolha; o site mostra apenas
 * o nome, o logótipo e a cidade. A tabela `web_school_showcase` é só do servidor
 * (migração 20261007100000); o ADMIN da plataforma pode esconder uma escola.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSgaWriterFor, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { getShowcaseChoice, setShowcaseOptIn } from "@/features/saas/web-site-content";
import { showcaseOptInInputSchema } from "@/features/saas/web-site-schemas";

export const getWebShowcase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    return getShowcaseChoice(membership.schoolId);
  });

export const updateWebShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => showcaseOptInInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    await setShowcaseOptIn(membership.schoolId, data.optedIn, context.userId);
    return getShowcaseChoice(membership.schoolId);
  });
