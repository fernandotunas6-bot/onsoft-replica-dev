import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STEP_UP_MAX_AGE_SECONDS,
  isRecentlyVerified,
  isStepUpError,
  lastVerificationAt,
  requireRecentVerification,
} from "@/lib/step-up";
import { isSessionError } from "@/lib/session-expiry";
import { isTwoFactorRequiredMessage } from "@/lib/two-factor-error";
import { passkeyRpId } from "@/features/auth/verification";

const NOW = 2_000_000_000;

describe("reconfirmação antes de acções críticas", () => {
  it("lê a verificação mais recente do amr", () => {
    const claims = {
      amr: [
        { method: "password", timestamp: NOW - 5000 },
        { method: "mfa/webauthn", timestamp: NOW - 60 },
      ],
    };
    expect(lastVerificationAt(claims)).toBe(NOW - 60);
    expect(lastVerificationAt({})).toBeNull();
    expect(lastVerificationAt({ amr: ["password"] })).toBeNull();
  });

  it("vale 15 minutos", () => {
    const at = (age: number) => ({ amr: [{ method: "mfa/totp", timestamp: NOW - age }] });
    expect(isRecentlyVerified(at(STEP_UP_MAX_AGE_SECONDS), NOW)).toBe(true);
    expect(isRecentlyVerified(at(STEP_UP_MAX_AGE_SECONDS + 1), NOW)).toBe(false);
  });

  it("recusa com 403 sem terminar a sessão nem confundir com falta de 2FA", () => {
    const error = (() => {
      try {
        requireRecentVerification({ amr: [] }, "Alterar os dados bancários da escola", NOW);
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(Error);
    expect((error as { statusCode?: number }).statusCode).toBe(403);
    expect(isStepUpError(error)).toBe(true);
    expect(isSessionError(error)).toBe(false);
    expect(isTwoFactorRequiredMessage((error as Error).message)).toBe(false);
  });

  it("sem amr (caminho de recurso do middleware) falha fechada", () => {
    expect(() => requireRecentVerification({ aal: "aal2" }, "x", NOW)).toThrow();
  });

  it("verificação recente passa", () => {
    expect(() =>
      requireRecentVerification({ amr: [{ method: "password", timestamp: NOW - 10 }] }, "x", NOW),
    ).not.toThrow();
  });

  it("as acções críticas exigem-na no servidor", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    const school = read("src/features/school/server.ts");
    expect(school).toMatch(
      /requireRecentVerification\(context\.claims, "Alterar os dados bancários da escola"\)/,
    );
    expect(school).toMatch(
      /requireRecentVerification\(context\.claims, "Alterar as regras de cobrança"\)/,
    );
    const payments = read("src/features/hr/payments.ts");
    for (const action of [
      "Alterar o destino de pagamento de um salário",
      "Autorizar uma ordem de pagamento salarial",
      "Confirmar um pagamento salarial",
      "Anular um pagamento salarial",
    ]) {
      expect(payments).toContain(`requireRecentVerification(context.claims, "${action}")`);
    }
    const access = read("src/features/access/server.ts");
    expect(access.match(/requireRecentVerification\(/g)?.length).toBe(3);
    expect(read("src/features/access/grants.ts")).toMatch(/requireRecentVerification\(/);
  });

  it("o ecrã abre a confirmação em vez de mostrar o erro", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    expect(read("src/router.tsx")).toMatch(/reportPossibleStepUp\(error\)/);
    expect(read("src/lib/action-error-toast.ts")).toMatch(/reportPossibleStepUp\(error\)/);
    expect(read("src/components/modals/QuickFormModal.tsx")).toMatch(/reportPossibleStepUp\(err\)/);
    expect(read("src/components/auth/AuthGate.tsx")).toMatch(/<StepUpDialog /);
  });
});

describe("chave de acesso", () => {
  it("uma só chave para portal-siga.com e todos os subdomínios", () => {
    expect(passkeyRpId("portal-siga.com")).toBe("portal-siga.com");
    expect(passkeyRpId("escola-a.portal-siga.com")).toBe("portal-siga.com");
    expect(passkeyRpId("ADMIN.portal-siga.com")).toBe("portal-siga.com");
  });

  it("domínio próprio de escola fica com a sua", () => {
    expect(passkeyRpId("portal.escola.ao")).toBe("portal.escola.ao");
    expect(passkeyRpId("portal-siga.com.evil.ao")).toBe("portal-siga.com.evil.ao");
  });
});
