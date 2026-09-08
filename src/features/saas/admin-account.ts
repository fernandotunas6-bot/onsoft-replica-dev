import { getAppName, getAppUrl, getAuthResetPasswordUrl } from "@/lib/app-config";
import { renderSchoolInvitationEmail } from "@/features/auth/email-templates";
import { resolveResendFromAddress, sendResendEmail } from "@/features/integrations/resend-client";

/**
 * Conta do administrador de uma escola acabada de provisionar.
 *
 * Porque não `inviteUserByEmail`: o convite nativo da Supabase só existe se o
 * mailer conseguir entregar. Sem SMTP próprio configurado, o serviço embutido
 * recusa domínios não entregáveis com `Email address "…" is invalid` e limita
 * a 2 envios por hora — ou seja, o provisionamento inteiro (tenant, escola,
 * bootstrap) ficava refém do e-mail e falhava para a maioria das escolas.
 *
 * Aqui a conta é criada primeiro (`createUser`, sem mailer, determinístico) e
 * a entrega do link de definição de senha é só um efeito secundário
 * best-effort. `inviteDelivered` diz a verdade a quem provisiona.
 */
export type SchoolAdminAccount = {
  userId: string;
  inviteDelivered: boolean;
  inviteChannel: "resend" | null;
  /** Link de definição de senha. Só para quem provisiona — nunca para o público. */
  setupUrl: string | null;
  deliveryError: string | null;
};

type AuthAdminApi = {
  auth: {
    admin: {
      createUser: (attrs: {
        email: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
      generateLink: (attrs: {
        type: "recovery";
        email: string;
        options?: { redirectTo?: string };
      }) => Promise<{
        data: { properties?: { action_link?: string } | null } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/** Mensagens cruas da Supabase Auth → português accionável. */
export function translateAdminAccountError(message: string): string {
  const raw = message.trim();
  if (/already been registered|already registered|already exists|duplicate/i.test(raw)) {
    return "Já existe uma conta com este e-mail. Use outro endereço para o administrador da escola.";
  }
  if (/email address .* is invalid|invalid email|email_address_invalid/i.test(raw)) {
    return "O e-mail do administrador foi recusado pelo serviço de identidade. Confirme o endereço.";
  }
  if (/password/i.test(raw)) {
    return "A senha inicial do administrador foi recusada pelo serviço de identidade.";
  }
  return raw || "Não foi possível criar a conta do administrador.";
}

/**
 * Cria a conta do administrador e tenta entregar o link de configuração.
 * Lança só se a **conta** não puder ser criada; falha de entrega nunca é fatal.
 */
export async function createSchoolAdminAccount(
  db: AuthAdminApi,
  input: { email: string; fullName: string; schoolName: string },
): Promise<SchoolAdminAccount> {
  const email = input.email.trim().toLowerCase();

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (createErr || !created.user) {
    throw new Error(
      translateAdminAccountError(
        createErr?.message ?? "Não foi possível criar a conta do administrador.",
      ),
    );
  }
  const userId = created.user.id;

  const account: SchoolAdminAccount = {
    userId,
    inviteDelivered: false,
    inviteChannel: null,
    setupUrl: null,
    deliveryError: null,
  };

  try {
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: getAuthResetPasswordUrl() },
    });
    const setupUrl = link?.properties?.action_link ?? null;
    if (linkErr || !setupUrl) {
      account.deliveryError = linkErr?.message ?? "Não foi possível gerar o link de acesso.";
      return account;
    }
    account.setupUrl = setupUrl;

    const apiKey = process.env["RESEND_API_KEY"]?.trim();
    if (!apiKey) {
      account.deliveryError = "RESEND_API_KEY não configurada — link de acesso não foi enviado.";
      return account;
    }

    const message = renderSchoolInvitationEmail({
      schoolName: input.schoolName,
      roleName: "Administrador da Escola",
      invitationUrl: setupUrl,
      platformName: getAppName(),
      platformUrl: getAppUrl(),
      recipientEmail: email,
    });
    await sendResendEmail({
      apiKey,
      from: process.env["RESEND_FROM_EMAIL"]?.trim() || resolveResendFromAddress(getAppUrl()),
      to: [email],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    account.inviteDelivered = true;
    account.inviteChannel = "resend";
  } catch (error) {
    account.deliveryError =
      error instanceof Error ? error.message : "Falha ao enviar o convite do administrador.";
  }

  return account;
}
