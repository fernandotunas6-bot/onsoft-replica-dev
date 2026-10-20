import { describe, expect, it } from "vitest";
import { classifySmokeStatus } from "../../scripts/siga/e2e-smoke-status.mjs";

describe("smoke E2E: nunca aprovar verificações não demonstradas", () => {
  const api = { label: "API plans", expected: [200] };

  it("aprova apenas um HTTP explicitamente esperado", () => {
    expect(classifySmokeStatus({ ...api, status: 200, ci: true })).toBe("pass");
    expect(
      classifySmokeStatus({
        label: "API me (anon)",
        expected: [401],
        status: 401,
        ci: true,
      }),
    ).toBe("pass");
  });

  it("não contabiliza erro 500 como aprovação quando o CI está sem base", () => {
    expect(classifySmokeStatus({ ...api, status: 500, ci: true })).toBe("skip");
  });

  it("fora do CI, qualquer HTTP 500 inesperado falha", () => {
    expect(classifySmokeStatus({ ...api, status: 500, ci: false })).toBe("fail");
  });

  it("um HTTP inesperado nunca é sucesso", () => {
    expect(classifySmokeStatus({ ...api, status: 403, ci: true })).toBe("fail");
  });

  it("PayFlow indisponível não é considerado aprovado", () => {
    expect(
      classifySmokeStatus({
        label: "PAYFLOW EMIS webhook (anon POST)",
        expected: [401, 503],
        status: 503,
        ci: true,
        optionalInCi: true,
      }),
    ).toBe("skip");
  });

  it("uma resposta normal do PayFlow opcional pode passar", () => {
    expect(
      classifySmokeStatus({
        label: "PAYFLOW health",
        expected: [200],
        status: 200,
        ci: true,
        optionalInCi: true,
      }),
    ).toBe("pass");
  });
});
