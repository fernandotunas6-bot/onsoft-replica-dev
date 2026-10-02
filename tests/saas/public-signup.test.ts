import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { runPublicSchoolSignup } from "@/features/saas/public-signup";
import { provisionTenantCore } from "@/features/saas/provisioning-core";
import { issueSignupVerificationToken } from "@/features/saas/signup-verification";
import { markLeadCompleted } from "@/features/saas/commercial-lifecycle";

// A chave de serviço assina o comprovativo de e-mail confirmado.
process.env["SUPABASE_SECRET_KEY"] = "chave-de-servico-de-teste-com-comprimento";

vi.mock("@/features/saas/commercial-lifecycle", () => ({
  markLeadCompleted: vi.fn().mockResolvedValue(undefined),
}));

// Mock provisionTenantCore to avoid actually touching DB during these logic tests.
// O mock devolve `slug`/`hostname` porque é o núcleo que os resolve (via
// getPlatformSubdomain) — o signup público repassa-os em vez de repetir aqui o
// domínio da plataforma.
vi.mock("@/features/saas/provisioning-core", () => ({
  provisionTenantCore: vi.fn().mockResolvedValue({
    success: true,
    tenantId: "11111111-1111-1111-1111-111111111111",
    slug: "escola-nova",
    hostname: "escola-nova.portal-siga.com",
    bootstrapSeeded: ["academic_years", "roles"],
    adminInviteDelivered: false,
    adminPasswordSet: true,
    adminSetupUrl: "https://exemplo.invalid/definir-senha",
  }),
}));

describe("runPublicSchoolSignup logic", () => {
  // Forma real de `PublicSchoolSignupInput` (ver features/saas/schemas.ts).
  // Antes este fixture usava `school_name` e omitia `plan_code`/`admin_*` —
  // campos que o schema exige. Como `provisionTenantCore` está mockado, o
  // teste passava a validar uma forma que a rota real rejeitaria.
  const baseData = {
    name: "Escola Nova",
    nif: "5417000000",
    slug: "escola-nova",
    contact_name: "Admin",
    contact_email: "test@example.com",
    contact_phone: "912345678",
    plan_code: "start" as const,
    admin_email: "admin@example.com",
    admin_name: "Administrador",
    admin_password: "senha-forte-123",
    website: "", // Honeypot must be empty
    email_verification_token: "",
    session_id: "22222222-2222-4222-8222-222222222222",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    baseData.email_verification_token = issueSignupVerificationToken("admin@example.com");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite o signup normal (chamando o provisionTenantCore sem honeypot)", async () => {
    const res = await runPublicSchoolSignup(baseData, "127.0.0.1");
    expect(res.success).toBe(true);
    expect(res.slug).toBe("escola-nova");
    expect(res.hostname).toBe("escola-nova.portal-siga.com");
    expect(res.adminInviteDelivered).toBe(false);
    // O link de definição de senha nunca sai pela API pública.
    expect(res).not.toHaveProperty("adminSetupUrl");
    expect(provisionTenantCore).toHaveBeenCalledWith(
      {
        name: "Escola Nova",
        nif: "5417000000",
        slug: "escola-nova",
        contact_name: "Admin",
        contact_email: "test@example.com",
        contact_phone: "912345678",
        plan_code: "start",
        admin_email: "admin@example.com",
        admin_name: "Administrador",
        admin_password: "senha-forte-123",
        trial_days: 14,
      },
      { auditUserId: null, source: "public_signup" },
    );
    // A escola nasceu: o acompanhamento do registo fecha-se.
    expect(markLeadCompleted).toHaveBeenCalledWith({
      sessionId: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.com",
      tenantId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("recusa sem o e-mail confirmado, antes de criar o que quer que seja", async () => {
    await expect(
      runPublicSchoolSignup({ ...baseData, email_verification_token: undefined }, "10.9.0.1"),
    ).rejects.toThrow(/Confirme o e-mail/);
    expect(provisionTenantCore).not.toHaveBeenCalled();
  });

  it("recusa um comprovativo emitido para outro e-mail", async () => {
    await expect(
      runPublicSchoolSignup(
        {
          ...baseData,
          email_verification_token: issueSignupVerificationToken("outro@example.com"),
        },
        "10.9.0.2",
      ),
    ).rejects.toThrow(/Confirme o e-mail/);
  });

  it("recusa um comprovativo expirado (mais de 2 h)", async () => {
    const token = issueSignupVerificationToken("admin@example.com");
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000);
    await expect(
      runPublicSchoolSignup({ ...baseData, email_verification_token: token }, "10.9.0.3"),
    ).rejects.toThrow(/Confirme o e-mail/);
  });

  it("domínios reservados (.test) dos testes E2E não precisam de código", async () => {
    const res = await runPublicSchoolSignup(
      { ...baseData, admin_email: "e2e+x@siga-plus.test", email_verification_token: undefined },
      "10.9.0.4",
    );
    expect(res.success).toBe(true);
  });

  it("bloqueia tentativas de rate-limit por IP", async () => {
    // 3 tentativas bem-sucedidas
    await runPublicSchoolSignup({ ...baseData, contact_email: "a@ex.com" }, "192.168.1.1");
    await runPublicSchoolSignup({ ...baseData, contact_email: "b@ex.com" }, "192.168.1.1");
    await runPublicSchoolSignup({ ...baseData, contact_email: "c@ex.com" }, "192.168.1.1");

    // A 4ª deve falhar, pois o limite é 3 por IP/Email no prazo de 1h
    await expect(
      runPublicSchoolSignup({ ...baseData, contact_email: "d@ex.com" }, "192.168.1.1"),
    ).rejects.toThrow(/Muitos pedidos/i);

    // Passada 1h e 1 minuto
    vi.advanceTimersByTime(60 * 60 * 1000 + 60000);

    // A próxima tentativa passa (rate-limit expirou)
    const res = await runPublicSchoolSignup(
      { ...baseData, contact_email: "e@ex.com" },
      "192.168.1.1",
    );
    expect(res.success).toBe(true);
  });

  it("bloqueia tentativas de rate-limit por Email (mesmo com IPs diferentes)", async () => {
    await runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.1");
    await runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.2");
    await runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.3");

    // 4ª falha porque o email já foi usado 3x
    await expect(
      runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.4"),
    ).rejects.toThrow(/Muitos pedidos/i);
  });
});
