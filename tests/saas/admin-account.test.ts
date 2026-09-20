import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createSchoolAdminAccount,
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
      : { properties: { action_link: "https://exemplo.invalid/definir-senha" } },
    error: overrides?.generateLinkError ?? null,
  });
  return { auth: { admin: { createUser, generateLink } } };
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
      /Já existe uma conta com este e-mail/,
    );
  });
});

describe("translateAdminAccountError", () => {
  it("traduz mensagens conhecidas da Supabase Auth", () => {
    expect(translateAdminAccountError("User already registered")).toMatch(/Já existe uma conta/);
    expect(translateAdminAccountError('Email address "x" is invalid')).toMatch(/recusado/);
    expect(translateAdminAccountError("Password should be at least 6 characters")).toMatch(
      /senha inicial/,
    );
  });

  it("devolve a mensagem crua quando não reconhece o padrão", () => {
    expect(translateAdminAccountError("algo inesperado")).toBe("algo inesperado");
  });
});
