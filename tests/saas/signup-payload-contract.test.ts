import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * O mesmo endpoint é chamado por um segundo arnês, em Python, que o CI corre
 * em `SIGA_E2E_LIVE=1`. Estava a faltar-lhe `admin_password` — obrigatório
 * muito antes desta auditoria — e depois também o `nif`. Não é validável por
 * zod directamente, por isso compara-se o conjunto de chaves.
 */
describe("o arnês Python envia os campos que o schema exige", () => {
  /** Derivadas do próprio schema, não escritas à mão: um `safeParse({})` diz quais são. */
  const camposObrigatorios = (() => {
    const parsed = publicSchoolSignupInputSchema.safeParse({});
    if (parsed.success) throw new Error("o schema deixou de ter campos obrigatórios");
    return Object.keys(parsed.error.flatten().fieldErrors).sort();
  })();

  const chavesDoPython = (() => {
    const código = readFileSync(
      resolve(__dirname, "../../scripts/siga/e2e-ecosystem-playwright.py"),
      "utf8",
    );
    const início = código.indexOf("def signup_payload");
    const corpo = código.slice(
      código.indexOf("return {", início),
      código.indexOf("\n    }", início),
    );
    return [...corpo.matchAll(/"([a-z_]+)":/g)].map((m) => m[1]);
  })();

  it("o schema continua a ter campos obrigatórios para comparar", () => {
    expect(camposObrigatorios.length).toBeGreaterThanOrEqual(6);
    expect(camposObrigatorios).toContain("nif");
    expect(camposObrigatorios).toContain("admin_password");
  });

  it("nenhum campo obrigatório falta no payload Python", () => {
    const emFalta = camposObrigatorios.filter((campo) => !chavesDoPython.includes(campo));
    expect(
      emFalta,
      `signup_payload() em scripts/siga/e2e-ecosystem-playwright.py não envia: ` +
        `${emFalta.join(", ")}. O POST devolve 400 e o teste live falha em todas as corridas.`,
    ).toEqual([]);
  });
});
