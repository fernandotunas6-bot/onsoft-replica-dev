import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildAdminLoginUrl,
  createSchoolAdminAccount,
  findAuthUserByEmail,
  translateAdminAccountError,
} from "@/features/saas/admin-account";

vi.mock("@/features/auth/email-templates", () => ({
  renderSchoolInvitationEmail: vi.fn(() => ({
    subject: "Bem-vindo",
    html: "<p>Bem-vindo</p>",
    text: "Bem-vindo",
  })),
}));

vi.mock("@/features/integrations/resend-client", () => ({
  resolveResendFromAddress: vi.fn(() => "no-reply@portal-siga.com"),
  resolveSystemSender: vi.fn(() => "SIGA Plus <noreply@portal-siga.com>"),
  sendResendEmail: vi.fn().mockResolvedValue({ id: "resend-1" }),
}));

function makeDb(overrides?: {
  createUserError?: { message: string } | null;
  generateLinkError?: { message: string } | null;
}) {
  const createUser = vi.fn().mockResolvedValue({
    data: overrides?.createUserError ? { user: null } : { user: { id: "admin-user-1" } },
    error: overrides?.createUserError ?? null,
  });
  const generateLink = vi.fn().mockResolvedValue({
    data: overrides?.generateLinkError
      ? null
      : {
          properties: {
            action_link: "https://exemplo.invalid/definir-senha",
            hashed_token: "hash-123",
          },
        },
    error: overrides?.generateLinkError ?? null,
  });
  const updateUserById = vi.fn().mockResolvedValue({ error: null });
  return { auth: { admin: { createUser, generateLink, updateUserById } } };
}

const baseInput = { email: "Director@Escola.AO", fullName: "Director", schoolName: "Escola Nova" };

describe("createSchoolAdminAccount", () => {
  const originalResendKey = process.env["RESEND_API_KEY"];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalResendKey === undefined) delete process.env["RESEND_API_KEY"];
    else process.env["RESEND_API_KEY"] = originalResendKey;
  });

  it("passa a senha escolhida para createUser e marca passwordSet=true", async () => {
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, {
      ...baseInput,
      password: "senha-forte-123",
    });
    expect(db.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "director@escola.ao", password: "senha-forte-123" }),
    );
    expect(account.passwordSet).toBe(true);
    expect(account.userId).toBe("admin-user-1");
  });

  it("sem senha (fluxo platform_admin), passwordSet=false e createUser recebe password undefined", async () => {
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, baseInput);
    expect(db.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ password: undefined }),
    );
    expect(account.passwordSet).toBe(false);
  });

  it("mesmo com senha definida, sem RESEND_API_KEY o convite por e-mail não é marcado como entregue", async () => {
    delete process.env["RESEND_API_KEY"];
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, {
      ...baseInput,
      password: "senha-forte-123",
    });
    // A conta continua utilizável por senha — só o e-mail extra de confirmação falha.
    expect(account.passwordSet).toBe(true);
    expect(account.inviteDelivered).toBe(false);
    expect(account.deliveryError).toMatch(/RESEND_API_KEY/);
  });

  it("com RESEND_API_KEY configurada, envia o e-mail e marca inviteDelivered=true", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key";
    const { sendResendEmail } = await import("@/features/integrations/resend-client");
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, {
      ...baseInput,
      password: "senha-forte-123",
    });
    expect(account.inviteDelivered).toBe(true);
    expect(account.inviteChannel).toBe("resend");
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });

  it("lança erro traduzido quando createUser falha", async () => {
    const db = makeDb({ createUserError: { message: "User already registered" } });
    await expect(createSchoolAdminAccount(db, baseInput)).rejects.toThrow(
      /já tem acesso a uma escola/,
    );
  });

  it("com senha definida devolve a entrada directa e o e-mail não gasta o token", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key";
    const { renderSchoolInvitationEmail } = await import("@/features/auth/email-templates");
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, {
      ...baseInput,
      password: "senha-forte-123",
    });
    expect(account.loginUrl).toContain("/auth/magic-link?token_hash=hash-123&type=recovery");
    expect(account.setupUrl).toBeNull();
    // O e-mail aponta para o login: um segundo token invalidaria o primeiro.
    expect(renderSchoolInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationUrl: expect.not.stringContaining("definir-senha"),
      }),
    );
  });

  it("sem senha, nunca há entrada directa — só o link de definição de senha", async () => {
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, baseInput);
    expect(account.loginUrl).toBeNull();
    expect(account.setupUrl).toBe("https://exemplo.invalid/definir-senha");
  });

  it("conta existente que nunca entrou: aplica a senha do registo, sem createUser", async () => {
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, {
      ...baseInput,
      password: "senha-forte-123",
      existing: { userId: "conta-antiga", neverSignedIn: true },
    });
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
    expect(db.auth.admin.updateUserById).toHaveBeenCalledWith(
      "conta-antiga",
      expect.objectContaining({ password: "senha-forte-123" }),
    );
    expect(account).toMatchObject({
      userId: "conta-antiga",
      passwordSet: true,
      reusedAccount: true,
    });
    expect(account.loginUrl).toContain("token_hash=");
  });

  it("conta existente com sessões (ex.: Google): credenciais intactas e sem sessão para quem registou", async () => {
    const db = makeDb();
    const account = await createSchoolAdminAccount(db, {
      ...baseInput,
      password: "senha-forte-123",
      existing: { userId: "conta-google", neverSignedIn: false },
    });
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
    expect(db.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(db.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(account).toMatchObject({
      userId: "conta-google",
      passwordSet: false,
      reusedAccount: true,
      loginUrl: null,
      setupUrl: null,
    });
  });
});

describe("findAuthUserByEmail", () => {
  it("encontra a conta ignorando maiúsculas e percorre as páginas", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, email: `x${i}@a.ao` }));
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: page1 }, error: null })
      .mockResolvedValueOnce({
        data: { users: [{ id: "alvo", email: "Director@Escola.ao", last_sign_in_at: null }] },
        error: null,
      });
    const found = await findAuthUserByEmail(
      { auth: { admin: { listUsers } } },
      "director@escola.ao",
    );
    expect(found).toEqual({ id: "alvo", lastSignInAt: null });
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("devolve null quando não há conta", async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: { users: [] }, error: null });
    expect(await findAuthUserByEmail({ auth: { admin: { listUsers } } }, "a@b.ao")).toBeNull();
  });

  it("falha fechado quando o serviço de identidade não responde", async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(findAuthUserByEmail({ auth: { admin: { listUsers } } }, "a@b.ao")).rejects.toThrow(
      /confirmar o e-mail/,
    );
  });
});

describe("buildAdminLoginUrl", () => {
  it("aponta para a página de link mágico do SIGA, que troca o token por sessão", () => {
    const url = new URL(buildAdminLoginUrl("abc"));
    expect(url.pathname).toBe("/auth/magic-link");
    expect(url.searchParams.get("token_hash")).toBe("abc");
    expect(url.searchParams.get("type")).toBe("recovery");
  });
});

describe("translateAdminAccountError", () => {
  it("traduz mensagens conhecidas da Supabase Auth", () => {
    expect(translateAdminAccountError("User already registered")).toMatch(
      /já tem acesso a uma escola/,
    );
    expect(translateAdminAccountError('Email address "x" is invalid')).toMatch(/recusado/);
    expect(translateAdminAccountError("Password should be at least 6 characters")).toMatch(
      /senha inicial/,
    );
  });

  it("devolve a mensagem crua quando não reconhece o padrão", () => {
    expect(translateAdminAccountError("algo inesperado")).toBe("algo inesperado");
  });
});
