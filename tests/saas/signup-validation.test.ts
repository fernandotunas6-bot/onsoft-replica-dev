import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSchoolWizardInputSchema,
  publicSchoolSignupInputSchema,
} from "@/features/saas/schemas";

/**
 * O registo de escola aceitava `nif`, `phone` e `contact_phone` como
 * `z.string().optional()` — qualquer texto passava — e a senha do administrador
 * bastava ter 8 caracteres, o que deixava entrar "12345678".
 *
 * O projecto já tinha `validateSchoolNif` e `validateAngolaPhone`, usadas na
 * matrícula, na autenticação e no módulo de pessoas. Só o registo de escola não
 * as usava.
 */

const base = {
  name: "Colégio Teste",
  nif: "5417000000",
  contact_name: "Ana Silva",
  contact_email: "ana@colegio.ao",
  admin_email: "admin@colegio.ao",
  admin_name: "Ana Silva",
  admin_password: "escola2026segura",
  plan_code: "start" as const,
  slug: "colegio-teste",
};

describe("NIF da escola", () => {
  it("aceita um NIF de entidade da AGT", () => {
    expect(createSchoolWizardInputSchema.parse(base).nif).toBe("5417000000");
  });

  it("recusa a criação sem NIF", () => {
    // Sem NIF a escola não exporta SAF-T: `validateSaftSchoolReadiness`
    // bloqueia. Era opcional, e 85 das 87 escolas em produção ficaram sem ele.
    const { nif: _omitted, ...semNif } = base;
    expect(() => createSchoolWizardInputSchema.parse(semNif)).toThrow(/NIF/i);
    expect(() => createSchoolWizardInputSchema.parse({ ...base, nif: "  " })).toThrow(/NIF/i);
  });

  it("recusa um NIF com formato inválido", () => {
    for (const nif of ["abc", "12", "não-sei"]) {
      expect(() => createSchoolWizardInputSchema.parse({ ...base, nif })).toThrow(/NIF/i);
    }
  });
});

describe("telefones", () => {
  it("aceita o formato angolano", () => {
    const parsed = createSchoolWizardInputSchema.parse({ ...base, phone: "+244923456789" });
    expect(parsed.phone).toBe("+244923456789");
  });

  it("continua opcional", () => {
    expect(() => createSchoolWizardInputSchema.parse(base)).not.toThrow();
  });

  it("recusa texto que não é telefone", () => {
    for (const field of ["phone", "contact_phone"]) {
      expect(() => createSchoolWizardInputSchema.parse({ ...base, [field]: "não tenho" })).toThrow(
        /Telefone/i,
      );
    }
  });

  it("recusa um número que não é móvel angolano", () => {
    expect(() => createSchoolWizardInputSchema.parse({ ...base, phone: "+351912345678" })).toThrow(
      /Telefone/i,
    );
  });
});

describe("senha do administrador", () => {
  it("aceita uma senha razoável", () => {
    expect(() =>
      createSchoolWizardInputSchema.parse({ ...base, admin_password: "colegio2026ao" }),
    ).not.toThrow();
  });

  it("recusa as senhas que o mínimo de 8 deixava passar", () => {
    // Esta conta manda numa instituição inteira: notas, moradas e telefones de
    // menores, e o financeiro das famílias.
    for (const senha of ["12345678", "password", "senha1234", "abc123456"]) {
      expect(
        () => createSchoolWizardInputSchema.parse({ ...base, admin_password: senha }),
        senha,
      ).toThrow();
    }
  });

  it("exige letras e números", () => {
    expect(() =>
      createSchoolWizardInputSchema.parse({ ...base, admin_password: "abcdefghijkl" }),
    ).toThrow(/letras e números/i);
  });

  it("aceita senhas que apenas começam por uma palavra comum", () => {
    // A primeira versão desta regra comparava por prefixo e rejeitava
    // "senha-forte-123" — uma senha legítima. Apanhado pelos testes que já
    // existiam no projecto. A regra passou a comparar o valor inteiro.
    for (const senha of ["senha-forte-123", "senhaDaEscola2026", "passwordDoColegio1"]) {
      expect(
        () => createSchoolWizardInputSchema.parse({ ...base, admin_password: senha }),
        senha,
      ).not.toThrow();
    }
  });

  it("recusa senhas só com dígitos", () => {
    expect(() =>
      createSchoolWizardInputSchema.parse({ ...base, admin_password: "9384726150" }),
    ).toThrow(/dígitos/i);
  });

  it("recusa o mesmo caracter repetido", () => {
    expect(() =>
      createSchoolWizardInputSchema.parse({ ...base, admin_password: "aaaaaaaaaaaa" }),
    ).toThrow();
  });
});

describe("e-mails", () => {
  it("normaliza para minúsculas", () => {
    // `createSchoolAdminAccount` já faz toLowerCase antes de criar a conta. Sem
    // isto, o que ficava guardado podia divergir do que serve para entrar.
    const parsed = createSchoolWizardInputSchema.parse({
      ...base,
      admin_email: "ADMIN@Colegio.AO",
      contact_email: "  Ana@Colegio.AO  ",
    });
    expect(parsed.admin_email).toBe("admin@colegio.ao");
    expect(parsed.contact_email).toBe("ana@colegio.ao");
  });

  it("recusa os formatos que o Zod já apanha", () => {
    for (const email of ["a@b", "x@y.z", "admin@colegio..ao", "admin@localhost"]) {
      expect(
        () => createSchoolWizardInputSchema.parse({ ...base, admin_email: email }),
        email,
      ).toThrow();
    }
  });
});

describe("registo público", () => {
  it("exige senha, ao contrário do wizard interno", () => {
    const { admin_password: _omitted, ...semSenha } = base;
    expect(() => publicSchoolSignupInputSchema.parse({ ...semSenha, website: "" })).toThrow();
    expect(() => createSchoolWizardInputSchema.parse(semSenha)).not.toThrow();
  });

  it("rejeita o honeypot preenchido", () => {
    expect(() =>
      publicSchoolSignupInputSchema.parse({ ...base, website: "http://spam.example" }),
    ).toThrow();
  });

  it("aplica as mesmas regras de NIF e senha do wizard", () => {
    expect(() => publicSchoolSignupInputSchema.parse({ ...base, website: "", nif: "xx" })).toThrow(
      /NIF/i,
    );
    expect(() =>
      publicSchoolSignupInputSchema.parse({ ...base, website: "", admin_password: "12345678" }),
    ).toThrow();
  });
});

/**
 * O wizard do WEB é mais estrito do que o servidor no NIF, e isso é
 * deliberado: uma inscrição nova tem de trazer o NIF de entidade da AGT, mas o
 * servidor também aceita o formato alfanumérico curto que escolas antigas têm
 * gravado — é a mesma função de que a exportação SAF-T depende, e apertá-la
 * aqui invalidaria dados que já existem.
 *
 * A assimetria fica fixada por teste para ser escolha e não descuido. Se um dia
 * o servidor apertar, este teste falha e obriga a decidir em vez de deixar o
 * wizard e a API divergirem em silêncio.
 */
describe("assimetria deliberada entre o wizard e o servidor no NIF", () => {
  /**
   * Lida do próprio wizard, não copiada para aqui. Uma constante duplicada
   * fixaria a minha ideia da regra, não a regra — e o ponto deste teste é
   * exactamente notar quando os dois lados divergem.
   */
  const WIZARD_NIF_REGEX = (() => {
    const wizard = readFileSync(
      resolve(__dirname, "../../painel/web/src/app/start/page.tsx"),
      "utf8",
    );
    const bloco = wizard.slice(wizard.indexOf("nif: z"), wizard.indexOf("city: z"));
    const found = bloco.match(/\.regex\(\s*(\/[^/]+\/)/);
    if (!found) throw new Error("o wizard deixou de validar o nif por regex — reveja este teste");
    return new RegExp(found[1].slice(1, -1));
  })();

  const nifOk = (nif: string) => createSchoolWizardInputSchema.safeParse({ ...base, nif }).success;

  it("o servidor aceita o NIF de entidade da AGT, que é o que o wizard exige", () => {
    expect(WIZARD_NIF_REGEX.test("5417000000")).toBe(true);
    expect(nifOk("5417000000")).toBe(true);
  });

  it("o servidor aceita o formato antigo que o wizard recusa", () => {
    // Uma escola gravada antes desta regra continua a poder ser actualizada
    // pela API e continua a exportar SAF-T.
    expect(WIZARD_NIF_REGEX.test("AO12345X")).toBe(false);
    expect(nifOk("AO12345X")).toBe(true);
  });

  it("nenhum dos dois aceita lixo", () => {
    for (const lixo of ["", "   ", "123", "abc", "NIF"]) {
      expect(WIZARD_NIF_REGEX.test(lixo)).toBe(false);
      expect(nifOk(lixo)).toBe(false);
    }
  });
});
