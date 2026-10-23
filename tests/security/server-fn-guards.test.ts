import { describe, expect, it } from "vitest";
import { blankCommentsAndStrings, scanServerFns, type ServerFnDeclaration } from "./server-fn-scan";

/**
 * Portão de autorização das server functions.
 *
 * Porque existe: a autorização do SIGA vive no código da aplicação. O cliente de
 * servidor (`client.server.ts`) fala com a base pela chave de serviço, por isso a
 * RLS protege a API do Supabase mas não as leituras da aplicação — quem as
 * protege é o middleware de cada `createServerFn`. Até este teste, isso era uma
 * convenção: uma server function nova sem guarda compilava, passava nos testes e
 * publicava-se. Agora falha aqui.
 *
 * Quem adicionar uma server function pública tem de a declarar em
 * `PUBLIC_SERVER_FNS` com a defesa que a substitui — e isso aparece no diff.
 */

/** Middlewares que contam como guarda de autenticação. */
const AUTH_MIDDLEWARES = new Set(["requireSupabaseAuth"]);

/**
 * Server functions deliberadamente sem sessão, com o que as defende no lugar do
 * guarda. A chave é `caminho:nome`.
 *
 * Antes de acrescentar uma entrada aqui: o que impede um visitante anónimo de
 * ler ou escrever dados de uma escola através desta função? Se a resposta for
 * "nada", a função precisa de guarda e não de excepção.
 */
const PUBLIC_SERVER_FNS: Record<string, string> = {
  // ─── Entrada, registo e reposição de senha: são o próprio acto de autenticar ──
  "src/features/access/server.ts:signInWithIdentifierFn":
    "É o login. Valida credenciais no Supabase Auth.",
  "src/features/auth/magic-link-server.ts:requestMagicLinkFn":
    "Pede um link de entrada por e-mail; o link é que autentica.",
  "src/features/auth/reset-password-server.ts:requestPasswordResetFn":
    "Pede a reposição por e-mail; não revela se a conta existe.",
  "src/features/auth/reset-password-otp-server.ts:resetPasswordWithOtpFn":
    "Exige o código OTP enviado para o contacto registado.",
  "src/features/auth/signup-server.ts:requestSignupFn":
    "Registo de utilizador; a prova de posse do e-mail vem depois.",
  "src/features/otp/server.ts:requestOtpVerificationFn":
    "Envia o código para o contacto; limitado por taxa no despachante.",
  "src/features/otp/server.ts:verifyOtpCodeFn":
    "Consome o código OTP — é a própria prova de posse do contacto.",

  // ─── Páginas públicas da escola: quem chega não tem conta ────────────────────
  "src/features/saas/server.ts:signupSchoolPublic":
    "Criação pública de escola, defendida por honeypot, prova de posse do e-mail, captcha e limite de taxa por IP e por e-mail (`public-signup.ts`).",
  "src/features/saas/server.ts:checkTenantSlug":
    "Só diz se um slug está livre, para o formulário de registo.",
  "src/features/saas/server.ts:getTenantBySlug":
    "Identidade pública da escola (nome, logótipo) para desenhar o portal.",
  "src/features/saas/server.ts:getTenantByHostname":
    "Resolve o domínio no tenant antes de haver sessão; devolve só identidade pública.",
  "src/features/saas/server.ts:listPlans": "Tabela de preços da landing — informação de catálogo.",
  "src/features/enrollment/server.ts:getPublicEnrollmentForm":
    "Formulário de matrícula aberto, acedido por token do formulário.",
  "src/features/enrollment/server.ts:submitPublicEnrollment":
    "Submissão de matrícula por um candidato sem conta; escreve apenas na própria candidatura.",

  "src/features/access/student-access-server.ts:studentNumberLoginAvailable":
    "Lida no ecrã de entrada, antes de haver sessão. Não aceita entrada do cliente — deriva a escola do cabeçalho Host do pedido — e devolve um só booleano: se aquela escola aceita entrada pelo número de aluno.",

  // ─── Verificação por código ou chave: o segredo vem no pedido ────────────────
  "src/features/documents/verification.ts:verifyIssuedDocument":
    "Verificação de um documento emitido pelo seu código, com limite de taxa por IP partilhado entre instâncias.",
  "src/features/calendar/feed.ts:getPublicCalendarFeed":
    "Feed de calendário acedido por token opaco na URL.",
  "src/features/catracas/server.ts:validateGatePassByDeviceApiKey":
    "Webhook de catraca autenticado pela `api_key` do dispositivo (`gate-pass-validation.ts`).",
};

const keyOf = (d: ServerFnDeclaration) => `${d.file}:${d.name}`;
const isGuarded = (d: ServerFnDeclaration) => d.middlewares.some((m) => AUTH_MIDDLEWARES.has(m));

describe("guardas das server functions", () => {
  const declarations = scanServerFns();

  it("encontra as server functions do src (a varredura não pode ficar vazia)", () => {
    // Sem este piso, quebrar a varredura fazia os testes abaixo passar sem verificar nada.
    expect(declarations.length).toBeGreaterThan(400);
    expect(declarations.filter(isGuarded).length).toBeGreaterThan(400);
  });

  it("toda a server function tem guarda de autenticação ou está declarada como pública", () => {
    const semGuarda = declarations.filter((d) => !isGuarded(d) && !(keyOf(d) in PUBLIC_SERVER_FNS));
    expect(
      semGuarda.map((d) => `${d.file}:${d.line} ${d.name}`),
      "Acrescente `.middleware([requireSupabaseAuth])` — ou, se a função é mesmo pública, " +
        "declare-a em PUBLIC_SERVER_FNS (tests/security/server-fn-guards.test.ts) com a defesa que a protege.",
    ).toEqual([]);
  });

  it("não há server functions anónimas (cada uma tem de ser nomeada para poder ser auditada)", () => {
    expect(
      declarations.filter((d) => d.name === "(anónima)").map((d) => `${d.file}:${d.line}`),
    ).toEqual([]);
  });

  it("a lista de públicas não tem entradas obsoletas", () => {
    const existentes = new Set(declarations.map(keyOf));
    const obsoletas = Object.keys(PUBLIC_SERVER_FNS).filter((k) => !existentes.has(k));
    expect(
      obsoletas,
      "Estas funções já não existem (ou mudaram de nome): retire-as de PUBLIC_SERVER_FNS " +
        "para a lista não virar um carimbo sobre código que ninguém revê.",
    ).toEqual([]);
  });

  it("cada pública tem uma justificação escrita", () => {
    const semRazao = Object.entries(PUBLIC_SERVER_FNS)
      .filter(([, razao]) => razao.trim().length < 20)
      .map(([k]) => k);
    expect(semRazao).toEqual([]);
  });

  it("só são aceites os middlewares aprovados como guarda", () => {
    const usados = new Set(declarations.flatMap((d) => d.middlewares));
    // Um middleware novo não pode passar a contar como autenticação sem passar por aqui.
    expect([...usados].sort()).toEqual([...AUTH_MIDDLEWARES].sort());
  });
});

describe("varredura das server functions", () => {
  it("ignora menções a createServerFn em comentários e em texto", () => {
    const fonte = [
      "// createServerFn( no comentário de linha",
      "/* createServerFn( em bloco */",
      'const msg = "createServerFn( dentro de texto";',
      "export const real = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(() => 1);",
    ].join("\n");
    const limpo = blankCommentsAndStrings(fonte);
    expect([...limpo.matchAll(/\bcreateServerFn\s*\(/g)]).toHaveLength(1);
    // Os números de linha não se deslocam.
    expect(limpo.split("\n")).toHaveLength(4);
  });
});
