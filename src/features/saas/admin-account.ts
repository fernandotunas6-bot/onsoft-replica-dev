import {
  getAppName,
  getAppUrl,
  getAuthMagicLinkUrl,
  getAuthResetPasswordUrl,
} from "@/lib/app-config";
import { renderSchoolInvitationEmail } from "@/features/auth/email-templates";
import {
  resolveResendFromAddress,
  resolveSystemSender,
  sendResendEmail,
} from "@/features/integrations/resend-client";

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
  /** true quando a conta já tem senha própria (definida por quem provisionou) — login imediato, sem depender de e-mail. */
  passwordSet: boolean;
  /** true quando a conta já existia (ex.: entrou antes com o Google) e foi só ligada à escola nova. */
  reusedAccount: boolean;
  /**
   * Link de entrada directa no SIGA, de uso único. Só existe quando a senha foi
   * definida neste mesmo pedido: quem o recebe já conhece a senha, por isso o
   * link não lhe dá nada que não tivesse — poupa-lhe só o segundo login.
   */
  loginUrl: string | null;
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
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
      generateLink: (attrs: {
        type: "recovery";
        email: string;
        options?: { redirectTo?: string };
      }) => Promise<{
        data: { properties?: { action_link?: string; hashed_token?: string } | null } | null;
        error: { message: string } | null;
      }>;
      updateUserById?: (
        userId: string,
        attrs: {
          password?: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
        },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Conta já existente com o e-mail do administrador, sem escola nenhuma.
 *
 * Acontece de duas formas, ambas vistas em produção: a pessoa entrou antes no
 * SIGA com o Google (a conta nasce sem vínculo escolar), ou uma tentativa de
 * registo anterior falhou depois de criar a conta. Recusar o registo nesses
 * casos dizia «já existe uma conta com este e-mail» a quem não tinha escola
 * nenhuma — e não havia saída.
 */
export type ExistingAdminAccount = {
  userId: string;
  /**
   * A conta nunca iniciou sessão: não tem dono activo, e a senha escolhida
   * neste registo passa a ser a dela. Com sessões anteriores (ex.: Google), as
   * credenciais existentes ficam intactas.
   */
  neverSignedIn: boolean;
};

type AuthUserSummary = { id: string; email?: string | null; last_sign_in_at?: string | null };

type AuthListApi = {
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data: { users: AuthUserSummary[] } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

const LIST_USERS_PAGE = 1000;
const LIST_USERS_MAX_PAGES = 50;

/** Conta do Supabase Auth com este e-mail, ou null. Mesmo método de reset-account-resolver. */
export async function findAuthUserByEmail(
  db: AuthListApi,
  email: string,
): Promise<{ id: string; lastSignInAt: string | null } | null> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: LIST_USERS_PAGE });
    if (error) throw new Error("Não foi possível confirmar o e-mail do administrador.");
    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.trim().toLowerCase() === normalized);
    if (match) return { id: match.id, lastSignInAt: match.last_sign_in_at ?? null };
    if (users.length < LIST_USERS_PAGE) return null;
  }
  return null;
}

/** Endereço de entrada no SIGA a partir do token de um link gerado no servidor. */
export function buildAdminLoginUrl(hashedToken: string): string {
  const url = new URL(getAuthMagicLinkUrl());
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

export const EMAIL_LINKED_TO_SCHOOL_MESSAGE =
  "Este e-mail já tem acesso a uma escola no SIGA Plus. Entre no SIGA com ele (ou use «Recuperar senha»). Para registar outra escola, use outro e-mail para o administrador.";

/** Mensagens cruas da Supabase Auth → português accionável. */
export function translateAdminAccountError(message: string): string {
  const raw = message.trim();
  if (/already been registered|already registered|already exists|duplicate/i.test(raw)) {
    return EMAIL_LINKED_TO_SCHOOL_MESSAGE;
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
 * Cria (ou reaproveita) a conta do administrador e tenta entregar o acesso.
 * Lança só se a **conta** não puder ser criada; falha de entrega nunca é fatal.
 */
export async function createSchoolAdminAccount(
  db: AuthAdminApi,
  input: {
    email: string;
    fullName: string;
    schoolName: string;
    password?: string;
    /** Conta já existente, sem escola — ver `ExistingAdminAccount`. */
    existing?: ExistingAdminAccount | null;
  },
): Promise<SchoolAdminAccount> {
  const email = input.email.trim().toLowerCase();

  let userId: string;
  let passwordSet = false;
  if (input.existing) {
    userId = input.existing.userId;
    if (input.existing.neverSignedIn && input.password) {
      const update = db.auth.admin.updateUserById;
      if (!update) throw new Error("Não foi possível actualizar a conta do administrador.");
      const { error } = await update(userId, {
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.fullName },
      });
      if (error) throw new Error(translateAdminAccountError(error.message));
      passwordSet = true;
    }
  } else {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password: input.password,
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
    userId = created.user.id;
    passwordSet = Boolean(input.password);
  }

  const account: SchoolAdminAccount = {
    userId,
    passwordSet,
    reusedAccount: Boolean(input.existing),
    loginUrl: null,
    inviteDelivered: false,
    inviteChannel: null,
    setupUrl: null,
    deliveryError: null,
  };

  // Conta com dono activo (já entrou antes, ex.: Google) e senha intacta: entra
  // como sempre entrou. Nem link de senha, nem link de entrada — isso daria a
  // quem preencheu o formulário uma sessão numa conta que não provou ser sua.
  if (account.reusedAccount && !passwordSet) return account;

  try {
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: passwordSet ? getAuthMagicLinkUrl() : getAuthResetPasswordUrl() },
    });
    const actionLink = link?.properties?.action_link ?? null;
    const hashedToken = link?.properties?.hashed_token ?? null;
    if (linkErr || !actionLink) {
      account.deliveryError = linkErr?.message ?? "Não foi possível gerar o link de acesso.";
      return account;
    }
    if (passwordSet) {
      // Um só token de recuperação vale de cada vez: fica para a entrada directa,
      // e o e-mail aponta para a página de login (a senha já existe).
      account.loginUrl = hashedToken ? buildAdminLoginUrl(hashedToken) : null;
    } else {
      account.setupUrl = actionLink;
    }

    const apiKey = process.env["RESEND_API_KEY"]?.trim();
    if (!apiKey) {
      account.deliveryError = "RESEND_API_KEY não configurada — link de acesso não foi enviado.";
      return account;
    }

    const message = renderSchoolInvitationEmail({
      schoolName: input.schoolName,
      roleName: "Administrador da Escola",
      invitationUrl: account.setupUrl ?? getAppUrl(),
      platformName: getAppName(),
      platformUrl: getAppUrl(),
      recipientEmail: email,
    });
    await sendResendEmail({
      apiKey,
      from: resolveSystemSender("auth", { schoolName: input.schoolName }),
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
