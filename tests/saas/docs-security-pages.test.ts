import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * As páginas de segurança do DOC dizem só o que o código faz. Até 11/11/2026, a
 * «Endurecimento de Segurança» mostrava SQL de tabelas que não existem (`public.alunos`,
 * `instituicao_id`), uma CSP activa com um domínio inventado, cookies `HttpOnly` com
 * `SameSite=Strict`, senhas de 10 caracteres e catracas com HMAC e nonce, e marcava tudo
 * como feito numa checklist.
 *
 * Cada número das páginas está preso aqui à constante de onde vem: mudar a constante
 * faz este teste falhar até a página dizer o mesmo.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const hardening = read("painel/docs/guide/security-hardening.md");
const routes = read("painel/docs/guide/route-security.md");

/** Linha da tabela «O quê | Limite», com qualquer alinhamento. */
const row = (what: string, limit: string) =>
  new RegExp(`\\|\\s*${what.replace(/[()]/g, "\\$&")}\\s*\\|\\s*${limit}\\s*\\|`);

describe("DOC — páginas de segurança presas ao código", () => {
  it("sem as afirmações inventadas da versão antiga", () => {
    for (const fake of [
      /public\.alunos|public\.utilizadores|instituicao_id|ADMIN_INSTITUCIONAL/,
      /central-admin\.siga\.plus/,
      /SameSite=Strict|HttpOnly`?,/,
      /HMAC|nonce/i,
      /10 caracteres/,
      /- \[x\]/,
    ]) {
      expect(hardening).not.toMatch(fake);
    }
  });

  it("senha: o mínimo e as regras de password-policy-error.ts", () => {
    const policy = read("src/lib/password-policy-error.ts");
    const min = /PASSWORD_MIN_LENGTH = (\d+);/.exec(policy)?.[1];
    expect(min).toBeDefined();
    expect(hardening).toContain(
      `Pelo menos ${min} caracteres, com maiúsculas, minúsculas e números.`,
    );
    expect(read("src/lib/pwned-password.ts")).toContain("https://api.pwnedpasswords.com/range/");
  });

  it("tentativas de entrada e de recuperação: os limites do servidor", () => {
    const access = read("src/features/access/server.ts");
    expect(access).toContain("BI_LOOKUP_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 }");
    expect(access).toContain("BI_ACCOUNT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 }");
    expect(hardening).toMatch(row("Entrada, por endereço IP", "10 por minuto"));
    expect(hardening).toMatch(row("Entrada, por conta (de qualquer IP)", "10 por 15 minutos"));

    expect(read("src/features/auth/magic-link-server.ts")).toContain(
      "MAGIC_LINK_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 }",
    );
    expect(hardening).toMatch(row("Ligação de entrada por e-mail", "5 por 15 minutos"));

    const reset = read("src/features/auth/reset-password-otp-server.ts");
    expect(reset).toContain("RESET_OTP_TRIES_PER_IP = { windowMs: 60 * 60 * 1000, max: 30 }");
    expect(reset).toContain(
      "RESET_OTP_TRIES_PER_ACCOUNT = { windowMs: 24 * 60 * 60 * 1000, max: 20 }",
    );
    expect(hardening).toMatch(row("Código de recuperação da senha, por IP", "30 por hora"));
    expect(hardening).toMatch(row("Código de recuperação da senha, por conta", "20 por dia"));
  });

  it("sessão: inactividade e dispositivo reconhecido de trusted-device.ts", () => {
    const device = read("src/features/auth/trusted-device.ts");
    expect(device).toContain("TRUSTED_DEVICE_DAYS = 30;");
    expect(device).toContain("SHARED_DEVICE_IDLE_MS = 30 * 60_000;");
    expect(hardening).toContain("30 minutos sem actividade");
    expect(hardening).toContain("o navegador fica reconhecido\ndurante 30 dias");
    // A sessão vive num cookie legível pela aplicação e o servidor usa o cabeçalho.
    const cookie = read("src/integrations/supabase/shared-session-storage.ts");
    expect(cookie).toContain("SameSite=Lax");
    expect(hardening).toContain("(`Secure`, `SameSite=Lax`)");
    expect(read("src/integrations/supabase/auth-middleware.ts")).toContain(
      'request.headers.get("authorization")',
    );
  });

  it("CSP: as duas páginas dizem «modo de relatório» enquanto o SIGA a envia assim", () => {
    const headers = read("src/lib/security-headers.ts");
    expect(headers).toContain('"Content-Security-Policy-Report-Only": CONTENT_SECURITY_POLICY');
    expect(headers).not.toMatch(/^\s*"Content-Security-Policy":/m);
    expect(hardening).toContain("**modo de relatório**");
    expect(routes).toContain("ainda está em\nmodo de relatório");
  });

  it("catracas: os limites de device-webhook-handler.ts", () => {
    const device = read("src/features/catracas/device-webhook-handler.ts");
    expect(device).toContain("DEVICE_BAD_KEY_LIMIT = { windowMs: 15 * 60 * 1000, max: 20 }");
    expect(device).toContain("DEVICE_SCAN_LIMIT = { windowMs: 60 * 1000, max: 120 }");
    expect(hardening).toContain("limite de 20 tentativas por 15 minutos");
    expect(hardening).toContain("até 120 leituras por minuto");
  });

  it("RLS: «todas as tabelas» continua verdade no retrato de produção", () => {
    const snapshot = JSON.parse(read("supabase/PRODUCTION_SNAPSHOT.json")) as {
      resumo: { tabelas: number; com_rls: number };
    };
    expect(snapshot.resumo.com_rls).toBe(snapshot.resumo.tabelas);
    expect(hardening).toMatch(/RLS\) em todas as tabelas/);
    expect(routes).toContain("Todas as tabelas têm segurança ao nível da linha (RLS)");
  });

  it("2FA na mudança de senha: a página e o código dizem o mesmo", () => {
    expect(read("src/features/auth/verification.ts")).toContain(
      "export async function factorsForSensitiveChange()",
    );
    expect(routes).toContain("mudar a senha pede sempre o segundo factor");
    expect(hardening).toContain("mudar a senha pede sempre o segundo factor");
  });

  it("limites de tamanho: a página só os afirma porque todas as rotas da API os têm", () => {
    expect(hardening).toContain("recusam corpos acima de um tamanho máximo, com o erro 413");
    expect(read("tests/security/api-body-limits.test.ts")).toContain(
      "nenhuma rota da API nem o auxiliar da consola lê o corpo sem limite",
    );
  });
});
