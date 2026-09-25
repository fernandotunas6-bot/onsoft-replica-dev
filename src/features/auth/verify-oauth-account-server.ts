import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

export interface VerifyOAuthAccountResponse {
 authorized:boolean;
 reason:"authorized"|"onboarding_required";
}
/** A autenticação Google comprova a identidade, não concede acesso escolar.
 * Contas sem vínculo permanecem activas para pedir autorização à secretaria.
 */
export const verifyOAuthAccountFn=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .handler(async({context}):Promise<VerifyOAuthAccountResponse>=>{
  const membership=await resolveSgaMembershipAdmin(context.userId);
  return {authorized:true,reason:membership?"authorized":"onboarding_required"};
 });
