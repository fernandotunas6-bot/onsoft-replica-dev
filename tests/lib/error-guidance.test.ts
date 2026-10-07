import { describe, expect, it } from "vitest";
import {
  GUIDANCE_RULE_IDS,
  guidanceActionPath,
  guidanceFixFor,
  guidanceFor,
} from "@/lib/error-guidance";

/**
 * Mensagens reais devolvidas pelo servidor (copiadas dos `throw new Error`)
 * e a regra que cada uma tem de activar. Uma mensagem nova de configuração
 * em falta entra aqui junto com a regra.
 */
const SERVER_MESSAGES: Array<[string, string, string | null]> = [
  // [mensagem, regra, destino]
  ["Não há ano lectivo activo.", "config.academic-year", "/calendario"],
  ["Não há ano lectivo activo para inscrever o estudante.", "config.academic-year", "/calendario"],
  ["Seleccione uma turma com ano lectivo.", "config.academic-year", "/calendario"],
  ["Seleccione o ano lectivo antes de publicar o horário.", "config.academic-year", "/calendario"],
  ["Só pode configurar o ano lectivo activo.", "config.academic-year", "/calendario"],
  ["Não há um ano lectivo activo para criar o período.", "config.academic-year", "/calendario"],
  ["Não há plano financeiro activo na escola.", "config.fee-plan", "settings:financeiro"],
  [
    "Não há plano financeiro activo. Defina primeiro a propina em Definições → Financeiro.",
    "config.fee-plan",
    "settings:financeiro",
  ],
  [
    "Dados bancários incompletos (titular, banco e IBAN).",
    "config.school-banking",
    "settings:financeiro",
  ],
  ["Sem regra de avaliação para calcular a média.", "config.assessment-model", "/pedagogica"],
  ["O curso não tem anos/classes configurados.", "config.grade-levels", "/pedagogica"],
  [
    "Associe disciplinas activas à turma antes de publicar o horário.",
    "config.class-subjects",
    "/pedagogica",
  ],
  [
    "Adicione pelo menos uma aula activa antes de publicar o horário.",
    "config.schedule-empty",
    "/pedagogica",
  ],
  ["A sala desta aula deixou de estar disponível.", "config.room", "/pedagogica"],
  ["O papel pedido não está configurado nesta escola.", "config.role-missing", "/acessos"],
  [
    "Esta escola ainda não tem assinatura associada. Fale com o suporte.",
    "config.subscription",
    "/configuracoes/assinatura",
  ],
  ["RESEND_API_KEY não configurada no servidor.", "config.email-provider", "settings:integracoes"],
  ["VITE_PAYFLOW_URL não está configurada.", "config.payments-provider", "settings:integracoes"],
  ["Configuração Zoom em falta: ZOOM_ACCOUNT_ID.", "config.zoom", "settings:integracoes"],
  [
    "Os lembretes ainda não estão activos: falta aplicar a migração.",
    "config.pending-migration",
    "/configuracoes/diagnostico",
  ],
  [
    "Aplique APPLY_ENROLLMENT_AND_PREMIUM.sql para ligar professores às turmas.",
    "config.pending-migration",
    "/configuracoes/diagnostico",
  ],
  ["O Portal Alumni ainda não está activado.", "config.alumni", null],
  [
    "O aluno não tem matrícula activa: atribua primeiro uma turma.",
    "process.enrollment-missing",
    "/alunos",
  ],
  [
    "A matrícula precisa de turma e ano lectivo para lançar notas.",
    "process.enrollment-missing",
    "/alunos",
  ],
  [
    "Matrícula cancelada — selecione outra turma com vagas disponíveis.",
    "process.class-full",
    "/pedagogica",
  ],
  [
    "Conflito de horário: sala B2. Altere o dia, a hora ou o recurso.",
    "process.schedule-conflict",
    "/pedagogica",
  ],
  ["Já existe um curso com o código INF.", "process.duplicate", null],
  ["Ficheiro demasiado grande (máximo 25 MB).", "process.file-too-big", null],
  ["Formato de ficheiro não suportado. Use .xlsx ou .csv.", "process.file-format", "/importar"],
  ["Esta época já está fechada.", "process.closed", null],
  ["Publicar o modelo de avaliação exige 2FA activo nesta sessão.", "access.two-factor", "/perfil"],
  ["Sem membership activa nesta escola.", "access.no-school", "/perfil"],
  ["Sem vínculo activo com uma escola.", "access.no-school", "/perfil"],
  ["Sem permissão para emitir documentos oficiais.", "access.denied", null],
  ["Atingiu o limite de pedidos por hora. Tente mais tarde.", "limit.rate", null],
  ["Failed to fetch", "network.offline", null],
  ["Seleccione turma e disciplina.", "process.select-required", null],
  ["O nome é obrigatório.", "process.validation", null],
  ["Não foi possível guardar a turma.", "generic.failed", "/configuracoes/diagnostico"],
];

function destination(id: string, message: string) {
  const guidance = guidanceFor(message);
  expect(guidance?.id, message).toBe(id);
  const action = guidance?.action;
  if (!action) return null;
  return action.kind === "settings" ? `settings:${action.panel}` : action.to;
}

describe("orientação de erros", () => {
  it.each(SERVER_MESSAGES)("%s → %s", (message, id, to) => {
    expect(destination(id, message)).toBe(to);
  });

  it("mensagens escritas para o utilizador ficam como título", () => {
    expect(guidanceFor("Não há ano lectivo activo.")?.title).toBeNull();
    expect(guidanceFor("Sem permissão para emitir documentos oficiais.")?.title).toBeNull();
  });

  it("mensagens técnicas ganham um título legível", () => {
    expect(guidanceFor("Failed to fetch")?.title).toBe("Sem ligação ao servidor");
    expect(
      guidanceFor('duplicate key value violates unique constraint "courses_code_key"')?.title,
    ).toBe("Este registo já existe");
    expect(guidanceFor("new row violates row-level security policy")?.title).toBe(
      "Não tem permissão para esta acção",
    );
  });

  it("reconhece os códigos do Postgres sem texto", () => {
    expect(guidanceFor({ code: "23505" })?.id).toBe("process.duplicate");
    expect(guidanceFor({ code: "23503" })?.id).toBe("process.in-use");
    expect(guidanceFor({ code: "42501" })?.id).toBe("access.denied");
    expect(guidanceFor({ code: "PGRST205" })?.id).toBe("config.pending-migration");
  });

  it("não inventa orientação para mensagens sem regra", () => {
    expect(guidanceFor("Escolha outro subdomínio, por favor")).not.toBeNull();
    expect(guidanceFor("Turma B criada.")).toBeNull();
    expect(guidanceFor("")).toBeNull();
    expect(guidanceFor(null)).toBeNull();
  });

  it("um número com 429 ou 504 não passa por limite nem por demora", () => {
    expect(guidanceFor("Recibo 4290 já emitido nesta série.")?.id).not.toBe("limit.rate");
    expect(guidanceFor("Fatura 15041 sem itens.")?.id).not.toBe("network.timeout");
  });

  it("quem não pode abrir o destino recebe a quem pedir", () => {
    const guidance = guidanceFor("Não há plano financeiro activo na escola.")!;
    expect(guidanceFixFor(guidance, true)).toBe(guidance.fix);
    expect(guidanceFixFor(guidance, false)).toMatch(
      /Se não tiver acesso, peça à direcção ou à tesouraria\.$/,
    );
  });

  it("os painéis de Definições abrem pelo caminho /configuracoes", () => {
    const action = guidanceFor("Não há plano financeiro activo na escola.")!.action!;
    expect(guidanceActionPath(action)).toBe("/configuracoes");
  });

  it("os identificadores das regras são únicos", () => {
    expect(new Set(GUIDANCE_RULE_IDS).size).toBe(GUIDANCE_RULE_IDS.length);
  });
});
