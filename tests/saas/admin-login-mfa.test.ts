import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_MFA_FRIENDLY_NAME,
  prepareAdminMfa,
  type AdminMfaApi,
} from "../../painel/admin/src/lib/admin-mfa";

/**
 * Login do ADMIN, 2.º passo: as rotas /api/saas/* do SIGA exigem `aal2`
 * (tests/saas/platform-admin-mfa.test.ts). Depois da palavra-passe o ADMIN tem de
 * pedir o código ou registar um autenticador — nunca entrar só com `aal1`.
 */
function mfaApi(overrides: {
  level?: string | null;
  totp?: Array<{ id: string; status: string }>;
  all?: Array<{ id: string; status: string }>;
  enrollError?: Error;
}) {
  const api = {
    getAuthenticatorAssuranceLevel: vi.fn(async () => ({
      data: { currentLevel: overrides.level ?? "aal1" },
    })),
    listFactors: vi.fn(async () => ({
      data: { totp: overrides.totp ?? [], all: overrides.all ?? overrides.totp ?? [] },
    })),
    unenroll: vi.fn(async () => ({ data: null, error: null })),
    enroll: vi.fn(async () =>
      overrides.enrollError
        ? { data: null, error: overrides.enrollError }
        : {
            data: { id: "novo", totp: { qr_code: "data:image/svg+xml;qr", secret: "SEGREDO" } },
            error: null,
          },
    ),
  } satisfies AdminMfaApi;
  return api;
}

describe("ADMIN — 2.º passo do login", () => {
  it("sessão já com aal2 entra sem pedir código", async () => {
    const api = mfaApi({ level: "aal2" });
    await expect(prepareAdminMfa(api)).resolves.toEqual({ step: "done" });
    expect(api.listFactors).not.toHaveBeenCalled();
    expect(api.enroll).not.toHaveBeenCalled();
  });

  it("com autenticador confirmado pede o código desse factor", async () => {
    const api = mfaApi({ totp: [{ id: "f1", status: "verified" }] });
    await expect(prepareAdminMfa(api)).resolves.toEqual({ step: "verify", factorId: "f1" });
    expect(api.enroll).not.toHaveBeenCalled();
    expect(api.unenroll).not.toHaveBeenCalled();
  });

  it("sem autenticador regista um novo e devolve o QR e a chave manual", async () => {
    const api = mfaApi({});
    await expect(prepareAdminMfa(api)).resolves.toEqual({
      step: "enroll",
      factorId: "novo",
      qrCode: "data:image/svg+xml;qr",
      secret: "SEGREDO",
    });
    expect(api.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: ADMIN_MFA_FRIENDLY_NAME,
    });
  });

  it("apaga registos por confirmar antes de registar de novo", async () => {
    const api = mfaApi({
      totp: [{ id: "pendente", status: "unverified" }],
      all: [
        { id: "pendente", status: "unverified" },
        { id: "outro", status: "unverified" },
      ],
    });
    await prepareAdminMfa(api);
    expect(api.unenroll).toHaveBeenCalledTimes(2);
    expect(api.unenroll).toHaveBeenCalledWith({ factorId: "pendente" });
    expect(api.unenroll).toHaveBeenCalledWith({ factorId: "outro" });
    expect(api.enroll).toHaveBeenCalledTimes(1);
  });

  it("falha do registo propaga o erro (o formulário termina a sessão)", async () => {
    const api = mfaApi({ enrollError: new Error("MFA desactivado no projecto") });
    await expect(prepareAdminMfa(api)).rejects.toThrow("MFA desactivado no projecto");
  });

  it("aal1 nunca dá «done»", async () => {
    const api = mfaApi({ level: "aal1", totp: [] });
    const result = await prepareAdminMfa(api);
    expect(result.step).not.toBe("done");
  });
});
