import { describe, expect, it } from "vitest";
import { publicSchoolSignupInputSchema } from "@/features/saas/schemas";
import { buildSignupPayload, uniqueE2ESlug } from "../e2e/helpers/ecosystem-urls";

/**
 * Os testes @live enviam um payload real para `/api/saas/signup`. Vivem em
 * `.spec.ts` (Playwright) e o vitest só corre `.test.ts` — ou seja, nada no CI
 * confirmava que esse payload ainda satisfaz o contrato do servidor.
 *
 * E já não satisfazia. Quando o `nif` passou a obrigatório, `buildSignupPayload`
 * ficou sem ele: o provisionamento comercial live passaria a receber 400 em
 * todas as corridas, e só se descobriria ao correr a suite live à mão.
 *
 * É a mesma família de falha que esta auditoria já encontrou três vezes —
 * artefacto que parece cobertura e nunca executa. Este teste executa: valida o
 * payload contra o schema do servidor, sem rede e sem base.
 */

describe("o payload dos testes live satisfaz o contrato do servidor", () => {
  it("é aceite por publicSchoolSignupInputSchema", () => {
    const parsed = publicSchoolSignupInputSchema.safeParse(buildSignupPayload(uniqueE2ESlug()));
    expect(
      parsed.success ? null : parsed.error.flatten().fieldErrors,
      "buildSignupPayload deixou de satisfazer o schema do signup público — " +
        "a suite @live receberia 400 em todas as corridas",
    ).toBeNull();
  });

  it("continua a declarar o NIF, que é o campo que já se perdeu uma vez", () => {
    // Asserção específica de propósito: o teste acima falharia por qualquer
    // razão, e a mensagem não diria que foi o NIF outra vez.
    const payload = buildSignupPayload(uniqueE2ESlug()) as Record<string, unknown>;
    expect(payload.nif, "sem NIF a escola não consegue gerar SAF-T para a AGT").toBeTruthy();
  });

  it("o slug gerado é aceite como subdomínio", () => {
    const payload = buildSignupPayload(uniqueE2ESlug("web"));
    expect(publicSchoolSignupInputSchema.safeParse(payload).success).toBe(true);
  });
});
