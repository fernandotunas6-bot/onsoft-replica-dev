import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { getAppUrl, getAppName, getAuthEmailChangeUrl } from "@/lib/app-config";
import { resolveTenantLookup } from "@/lib/saas/tenant-resolver";
import { fetchSchoolBranding } from "./reset-password-server";
import { renderEmailChangeEmail } from "./email-templates/email-change.html";
import {
  sendResendEmail,
  resolveResendFromAddress,
  resolveSystemSender,
} from "@/features/integrations/resend-client";

export const requestEmailChangeInputSchema = z.object({
  newEmail: z.string().trim().email("Indique um endereço de e-mail válido."),
  hostname: z.string().trim().optional(),
});

/**
 * Alteração de e-mail com confirmação por link, entregue com o mesmo padrão
 * de branding institucional dos outros fluxos de Auth (nunca o mailer nativo
 * do Supabase). Diferente da recuperação de senha, esta acção é autenticada
 * e auto-iniciada — não há razão de privacidade para respostas neutras: se
 * falhar, o utilizador sabe imediatamente porquê.
 *
 * `type: "email_change_new"` confirma só a posse do novo endereço. Se o
 * projecto Supabase tiver "Secure email change" activado no Dashboard, a
 * confirmação também exige o endereço antigo — nesse caso, o admin do
 * projecto deve desactivar essa opção ou pedir para estender este fluxo.
 */
export const requestEmailChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => requestEmailChangeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const newEmail = data.newEmail.toLowerCase().trim();

    const db = await loadSgaAdminClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (userError || !authData.user?.email) {
      throw new Error("Não foi possível confirmar a conta actual.");
    }
    const currentEmail = authData.user.email.toLowerCase();
    if (currentEmail === newEmail) {
      throw new Error("O novo e-mail deve ser diferente do actual.");
    }

    const membership = await resolveSgaMembershipAdmin(context.userId);
    let schoolName = getAppName();
    let logoUrl: string | null = null;
    let primaryColor: string | null = null;
    let targetOrigin = getAppUrl();
    if (membership?.schoolId) {
      const { data: school } = await db
        .from("schools")
        .select("name, tenant_id")
        .eq("id", membership.schoolId)
        .maybeSingle();
      schoolName = school?.name || schoolName;
      const branding = await fetchSchoolBranding(db, membership.schoolId);
      logoUrl = branding.logoUrl;
      primaryColor = branding.primaryColor;

      // Mesma regra do reset de senha e do magic link: subdomínios
      // <slug>.portal-siga.com sempre voltam ao domínio central; só um
      // domínio customizado VERIFICADO e pertencente à MESMA escola do
      // utilizador autenticado preserva a própria origem no redirect.
      const hostname = data.hostname?.toLowerCase().trim();
      if (hostname && school?.tenant_id) {
        const lookup = resolveTenantLookup(hostname);
        if (lookup.mode === "hostname" && lookup.hostname) {
          const { data: domainRow } = await db
            .from("tenant_domains")
            .select("tenant_id")
            .eq("hostname", lookup.hostname)
            .eq("status", "verified")
            .maybeSingle();
          if (domainRow?.tenant_id === school.tenant_id) {
            targetOrigin = `https://${lookup.hostname}`;
          }
        }
      }
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "email_change_new",
      email: currentEmail,
      newEmail,
      options: { redirectTo: getAuthEmailChangeUrl(targetOrigin) },
    });
    if (linkError || !linkData?.properties?.action_link) {
      throw new Error(linkError?.message || "Não foi possível gerar o link de confirmação.");
    }

    const apiKey = process.env["RESEND_API_KEY"]?.trim();
    if (!apiKey) {
      throw new Error("RESEND_API_KEY não configurada no servidor — não é possível enviar e-mail.");
    }

    const message = renderEmailChangeEmail({
      schoolName,
      newEmail,
      confirmUrl: linkData.properties.action_link,
      logoUrl,
      primaryColor,
      platformName: getAppName(),
      platformUrl: getAppUrl(),
    });
    await sendResendEmail({
      apiKey,
      from: resolveSystemSender("auth", { schoolName }),
      to: [newEmail],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    try {
      await db.from("saas_audit_logs").insert({
        action: "email_change_requested",
        entity: "auth",
        entity_id: context.userId,
        metadata: { school_name: schoolName, timestamp: new Date().toISOString() },
      });
    } catch {
      /* Silencioso para não interromper */
    }

    return { success: true, message: `Enviámos um link de confirmação para ${newEmail}.` };
  });
