/**
 * Orientação para erros: o que correu mal, como se faz correctamente e onde
 * se corrige.
 *
 * Um erro no SIGA cai num de três casos:
 *   - **configuração** em falta ou errada (sem ano lectivo, sem plano de
 *     propinas, sem modelo de avaliação…) → o aviso leva ao sítio onde se
 *     configura, o mesmo que o guia de arranque (`setup-guide.ts`) usa;
 *   - **processo** feito pela ordem errada ou com dados inválidos (matrícula
 *     sem turma, registo repetido, ficheiro grande demais…) → o aviso diz a
 *     forma certa de o fazer e, quando há, abre o ecrã do passo em falta;
 *   - **acesso, sessão ou rede** → explica a quem pedir ou o que tentar.
 *
 * Este ficheiro é lógica pura (sem React, sem base) para ser testado em
 * `tests/lib/error-guidance.test.ts`. Quem mostra os avisos é `@/lib/toast`
 * (todos os `toast.error` do sistema), `toastActionError`, o `MutationCache`
 * do router e o `RouteErrorScreen`.
 *
 * Para acrescentar um caso: uma regra nova em `RULES`, com o texto exacto
 * que o servidor devolve no teste. Ver `docs/agents/ERROR_GUIDANCE.md`.
 */

import { isTechnicalMessage } from "@/lib/public-error";

/** Destino da correcção: o mesmo formato do guia de arranque (`SetupAction`). */
export type GuidanceAction =
  | { kind: "route"; to: string; search?: Record<string, string>; label: string }
  | { kind: "settings"; panel: string; label: string };

export type GuidanceKind =
  "config" | "process" | "permission" | "session" | "network" | "limit" | "unavailable";

export type Guidance = {
  /** Identificador estável da regra (testes e deduplicação dos avisos). */
  id: string;
  kind: GuidanceKind;
  /**
   * Título do aviso quando a mensagem original é técnica (SQL, rede, JSON).
   * `null` quando a mensagem foi escrita para o utilizador: essa fica.
   */
  title: string | null;
  /** A forma certa de fazer, numa ou duas frases. */
  fix: string;
  action?: GuidanceAction;
  /** Quem pode corrigir, quando a pessoa não tem acesso ao destino. */
  owner?: string;
};

type Rule = Omit<Guidance, "title"> & {
  /** Testada contra a mensagem do erro. */
  match: RegExp;
  /** Código Postgres/PostgREST que também activa a regra. */
  codes?: string[];
  /** Título para mensagens técnicas; sem ele usa-se o título genérico do tipo. */
  title?: string;
};

/** A quem pedir, já com a preposição: «peça à direcção…», «peça ao administrador…». */
const DIRECTION = "à direcção ou à secretaria da escola";

/* Destinos — os mesmos do guia de arranque. */
const TO_CALENDAR: GuidanceAction = {
  kind: "route",
  to: "/calendario",
  label: "Abrir calendário",
};
const TO_STRUCTURE: GuidanceAction = {
  kind: "route",
  to: "/pedagogica",
  search: { tab: "estrutura" },
  label: "Abrir estrutura",
};
const TO_CLASSES: GuidanceAction = {
  kind: "route",
  to: "/pedagogica",
  search: { tab: "turmas" },
  label: "Abrir turmas",
};
const TO_SUBJECTS: GuidanceAction = {
  kind: "route",
  to: "/pedagogica",
  search: { tab: "disciplinas" },
  label: "Abrir disciplinas",
};
const TO_ASSESSMENT: GuidanceAction = {
  kind: "route",
  to: "/pedagogica",
  search: { tab: "modelos" },
  label: "Abrir modelos de avaliação",
};
const TO_SCHEDULE: GuidanceAction = {
  kind: "route",
  to: "/pedagogica",
  search: { tab: "horarios" },
  label: "Abrir horários",
};
const TO_ROOMS: GuidanceAction = {
  kind: "route",
  to: "/pedagogica",
  search: { tab: "salas" },
  label: "Abrir salas",
};
const TO_STUDENTS: GuidanceAction = { kind: "route", to: "/alunos", label: "Abrir alunos" };
const TO_ACCESS: GuidanceAction = { kind: "route", to: "/acessos", label: "Abrir acessos" };
const TO_SECURITY: GuidanceAction = {
  kind: "route",
  to: "/perfil",
  search: { tab: "seguranca" },
  label: "Activar 2FA",
};
const TO_SUBSCRIPTION: GuidanceAction = {
  kind: "route",
  to: "/configuracoes/assinatura",
  label: "Ver assinatura",
};
const TO_DIAGNOSTICS: GuidanceAction = {
  kind: "route",
  to: "/configuracoes/diagnostico",
  label: "Abrir diagnóstico",
};
const TO_PROFILE: GuidanceAction = { kind: "route", to: "/perfil", label: "Abrir perfil" };
const SETTINGS = (panel: string, label: string): GuidanceAction => ({
  kind: "settings",
  panel,
  label,
});

/**
 * A ordem conta: a primeira regra que casa ganha. As mais específicas vêm
 * antes das genéricas (ex.: «sem ano lectivo» antes de «não encontrado»).
 */
const RULES: Rule[] = [
  /* 2FA primeiro: a recusa cita a acção, que pode falar de qualquer módulo. */
  {
    id: "access.two-factor",
    kind: "permission",
    match: /\b2FA\b|\bMFA\b|duas etapas/i,
    title: "Esta acção exige verificação em duas etapas (2FA)",
    fix: "Active o 2FA no seu perfil (Segurança) e repita a acção.",
    action: TO_SECURITY,
  },
  /* ───────────── Configuração da escola ───────────── */
  {
    id: "config.academic-year",
    kind: "config",
    match:
      /(não há|sem|nenhum) (um )?ano lectivo activo|seleccione (o|uma turma com) ano lectivo|ano lectivo não encontrado|só pode configurar o ano lectivo activo/i,
    title: "Falta o ano lectivo activo",
    fix: "Crie ou active o ano lectivo no Calendário. Sem ele não há turmas, trimestres nem propinas.",
    action: TO_CALENDAR,
    owner: DIRECTION,
  },
  {
    id: "config.terms",
    kind: "config",
    match:
      /(não há|sem) (trimestre|semestre|período)s?|período (lectivo )?(não encontrado|em falta)/i,
    title: "Faltam os trimestres do ano lectivo",
    fix: "Grave as datas dos trimestres (ou semestres) no Calendário e repita.",
    action: TO_CALENDAR,
    owner: DIRECTION,
  },
  {
    id: "config.fee-plan",
    kind: "config",
    match: /(não há|sem) plano financeiro activo|plano de propinas? (em falta|inexistente)/i,
    title: "Falta o plano de propinas",
    fix: "Em Definições → Financeiro, crie o plano do ano lectivo activo com o preço da propina e repita.",
    action: SETTINGS("financeiro", "Abrir Financeiro"),
    owner: "à direcção ou à tesouraria",
  },
  {
    id: "config.school-banking",
    kind: "config",
    match: /dados bancários incompletos|IBAN (da escola )?(em falta|inválido)/i,
    title: "Faltam os dados bancários da escola",
    fix: "Preencha titular, banco e IBAN (AO06 + 21 dígitos) em Definições → Financeiro.",
    action: SETTINGS("financeiro", "Abrir Financeiro"),
    owner: "à direcção ou à tesouraria",
  },
  {
    id: "config.school-data",
    kind: "config",
    match: /\bNIF\b.*(em falta|obrigatório|inválido)|dados da escola (em falta|incompletos)/i,
    title: "Faltam dados da escola",
    fix: "Complete NIF, director(a) e contactos em Definições → Escola: saem nos recibos e na SAF-T.",
    action: SETTINGS("escola", "Abrir dados da escola"),
    owner: DIRECTION,
  },
  {
    id: "config.assessment-model",
    kind: "config",
    match:
      /sem regra de avaliação|modelo de avaliação (em falta|não (está )?publicado)|sem modelo de avaliação/i,
    title: "Falta o modelo de avaliação",
    fix: "Publique o modelo de avaliação do ano em Pedagógica → Modelos. As médias e pautas dependem dele.",
    action: TO_ASSESSMENT,
    owner: DIRECTION,
  },
  {
    id: "config.grade-levels",
    kind: "config",
    match:
      /não tem anos\/classes configurad|sem classes|(curso|classe)s? (em falta|não configurad)/i,
    title: "O curso ainda não tem classes",
    fix: "Em Pedagógica → Estrutura, aplique um modelo do MED ou crie as classes do curso.",
    action: TO_STRUCTURE,
    owner: DIRECTION,
  },
  {
    id: "config.class-subjects",
    kind: "config",
    match:
      /associe disciplinas activas à turma|turma sem disciplinas|disciplinas atribuídas à turma/i,
    title: "A turma não tem disciplinas",
    fix: "Associe as disciplinas à turma em Pedagógica → Disciplinas antes de publicar o horário.",
    action: TO_SUBJECTS,
    owner: DIRECTION,
  },
  {
    id: "config.schedule-empty",
    kind: "process",
    match: /adicione pelo menos uma aula activa|publicar o horário/i,
    fix: "Monte o horário em Pedagógica → Horários: escolha turma, disciplina, dia e hora, e só depois publique.",
    action: TO_SCHEDULE,
  },
  {
    id: "config.room",
    kind: "config",
    match: /a sala .*(inactiva|não está disponível|deixou de estar disponível|lotação)/i,
    fix: "Reactive a sala ou escolha outra em Pedagógica → Salas, com lotação para a turma.",
    action: TO_ROOMS,
    owner: DIRECTION,
  },
  {
    id: "config.role-missing",
    kind: "config",
    match: /o papel pedido não está configurado|cargo (não existe|em falta)/i,
    fix: "Em Acessos, confirme que o cargo existe na escola e atribua-o à conta.",
    action: TO_ACCESS,
    owner: "ao administrador da escola",
  },
  {
    id: "config.alumni",
    kind: "config",
    match: /portal alumni ainda não está activado|acesso alumni ainda não está activado/i,
    fix: "A escola activa o Portal Alumni no módulo Alumni. Peça à secretaria que active o seu processo.",
    owner: DIRECTION,
  },
  {
    id: "config.subscription",
    kind: "config",
    match:
      /ainda não tem assinatura|assinatura (expirou|suspensa|inactiva)|não está incluíd[oa] no (seu )?plano|plano da escola não inclui/i,
    fix: "Veja o plano activo e o que inclui em Configurações → Assinatura.",
    action: TO_SUBSCRIPTION,
    owner: "ao administrador da escola",
  },
  {
    id: "config.email-provider",
    kind: "unavailable",
    match: /RESEND_API_KEY|envio de e-mail (não está )?configurad/i,
    title: "O envio de e-mail não está configurado",
    fix: "O servidor ainda não tem o fornecedor de e-mail ligado. Veja o estado em Definições → Integrações e avise o suporte.",
    action: SETTINGS("integracoes", "Abrir Integrações"),
  },
  {
    id: "config.payments-provider",
    kind: "unavailable",
    match:
      /VITE_PAYFLOW_URL|não está configurado na AppyPay|PayFlow (indisponível|não configurado)/i,
    title: "Os pagamentos online não estão configurados",
    fix: "Confirme o método de pagamento em Definições → Integrações; se continuar, avise o suporte.",
    action: SETTINGS("integracoes", "Abrir Integrações"),
  },
  {
    id: "config.zoom",
    kind: "unavailable",
    match: /configuração zoom em falta|sala virtual .*não está disponível/i,
    fix: "Ligue a conta Zoom em Definições → Integrações antes de marcar aulas online.",
    action: SETTINGS("integracoes", "Abrir Integrações"),
  },
  {
    id: "config.pending-migration",
    kind: "unavailable",
    match:
      /falta aplicar a migração|aplique .*\.sql|aplique a migração|schema cache|tabela em falta|relation .* does not exist|PGRST20[45]/i,
    codes: ["42P01", "PGRST204", "PGRST205"],
    title: "Esta função ainda não está activa nesta escola",
    fix: "Falta uma actualização da base de dados. Não é um erro seu: avise o suporte com o nome deste ecrã.",
    action: TO_DIAGNOSTICS,
  },

  /* ───────────── Processo pela ordem errada ───────────── */
  {
    id: "process.enrollment-missing",
    kind: "process",
    match:
      /não tem matrícula activa|precisa de matrícula activa|matrícula precisa de turma e ano lectivo|matrículas precisam de turma e ano lectivo|atribua primeiro uma turma/i,
    fix: "Primeiro matricule o aluno numa turma do ano lectivo activo (Alunos → Matricular); depois lance notas ou emita o documento.",
    action: { kind: "route", to: "/alunos", search: { action: "matricular" }, label: "Matricular" },
  },
  {
    id: "process.class-full",
    kind: "process",
    match: /matrícula cancelada|sem vagas|turma (cheia|lotada)|lotação (esgotada|excedida)/i,
    fix: "Escolha outra turma com vagas, ou aumente a lotação da turma em Pedagógica → Turmas.",
    action: TO_CLASSES,
  },
  {
    id: "process.select-required",
    kind: "process",
    match: /^seleccione|^selecione|^indique|^escolha/i,
    fix: "Preencha o campo indicado no formulário e volte a carregar em Guardar.",
  },
  {
    id: "process.schedule-conflict",
    kind: "process",
    match: /conflito de horário/i,
    fix: "Mude o dia, a hora ou o recurso (professor, sala, turma) que está ocupado.",
    action: TO_SCHEDULE,
  },
  {
    id: "process.duplicate",
    kind: "process",
    match:
      /duplicate key|já existe|já está (registad|ligad|associad|em uso)|unique constraint|já foi pedido/i,
    codes: ["23505"],
    title: "Este registo já existe",
    fix: "Procure o registo existente e edite-o, ou use outro código/nome. Não é preciso criá-lo outra vez.",
  },
  {
    id: "process.in-use",
    kind: "process",
    match: /foreign key|violates foreign key|ainda está a ser usad|tem registos associados/i,
    codes: ["23503"],
    title: "Este registo está a ser usado noutro sítio",
    fix: "Desactive-o em vez de o apagar, ou retire primeiro as ligações (turmas, matrículas, faturas) que dependem dele.",
  },
  {
    id: "process.invalid-value",
    kind: "process",
    match: /violates check constraint|violates not-null|invalid input syntax|value too long/i,
    codes: ["23514", "23502", "22P02", "22001"],
    title: "Há um campo com um valor inválido",
    fix: "Reveja os campos obrigatórios e o formato (datas dd/mm/aaaa, valores só com números) e guarde outra vez.",
  },
  {
    id: "process.file-too-big",
    kind: "process",
    match: /(demasiado grande|no máximo \d+ ?MB|passa de \d+ ?MB|excede o tamanho)/i,
    fix: "Reduza o ficheiro (comprima o PDF ou a imagem) ou divida-o em partes e envie outra vez.",
  },
  {
    id: "process.file-format",
    kind: "process",
    match: /formato (de ficheiro )?não suportado|formato fora do padrão|use \.xlsx ou \.csv/i,
    fix: "Descarregue o modelo oficial em Importar, preencha-o sem mudar as colunas e envie-o em .xlsx ou .csv.",
    action: { kind: "route", to: "/importar", label: "Abrir modelos de importação" },
  },
  {
    id: "process.closed",
    kind: "process",
    match:
      /já está (fechad|cancelad|liquidad|concluíd)|já liquidado|época já está fechada|plano mudou entretanto/i,
    fix: "Este registo já foi fechado. Actualize a lista; para corrigir, abra um pedido de rectificação em vez de editar.",
  },
  {
    id: "process.email-unconfirmed",
    kind: "process",
    match: /confirme (primeiro )?o e-mail|e-mail (não confirmado|por confirmar)/i,
    fix: "Abra a mensagem de confirmação no seu e-mail (veja também o spam) e repita a acção.",
    action: TO_PROFILE,
  },

  /* ───────────── Mensagens ───────────── */
  {
    id: "messages.staff-only",
    kind: "process",
    match: /só pode enviar mensagens ao pessoal da escola/i,
    fix: "Alunos e encarregados escrevem à direcção, à secretaria, à tesouraria e aos professores. Escolha um destes contactos em «Nova conversa».",
  },
  {
    id: "messages.not-member",
    kind: "permission",
    match: /não participa nesta conversa|utilizador não pertence à escola/i,
    fix: "A conversa ou o contacto já não está disponível nesta escola. Feche-a e comece uma nova em «Nova conversa».",
  },
  {
    id: "messages.attachment",
    kind: "process",
    match:
      /anexo (foi apagado|ficou guardado|tem de ser)|só pode anexar ficheiros|ficheiro anexado já não existe/i,
    fix: "Escolha outro ficheiro em Arquivos que consiga abrir, ou peça a quem o enviou que o anexe de novo.",
    action: { kind: "route", to: "/arquivos", label: "Abrir Arquivos" },
  },
  {
    id: "messages.own-only",
    kind: "process",
    match: /só pode apagar as mensagens que enviou|responder a mensagens da mesma conversa/i,
    fix: "Só se apagam as próprias mensagens, e só se responde a mensagens da conversa aberta.",
  },
  {
    id: "messages.empty",
    kind: "process",
    match: /escreva uma mensagem ou anexe/i,
    fix: "Escreva o texto na caixa por baixo da conversa, ou toque no clipe para anexar um ficheiro, e carregue em Enviar.",
  },

  /* ───────────── Acesso, sessão, rede e limites ───────────── */
  {
    id: "access.no-school",
    kind: "permission",
    match: /sem (membership|vínculo) activ[ao]|sem escola activa/i,
    title: "A sua conta não está ligada a esta escola",
    fix: "Escolha a escola certa no seu perfil ou peça um convite à secretaria da escola.",
    action: { kind: "route", to: "/perfil", search: { tab: "instituicoes" }, label: "Ver escolas" },
  },
  {
    id: "access.denied",
    kind: "permission",
    match:
      /sem permissão|permission denied|row-level security|not authorized|forbidden|só pode (planear|consultar|gerir)/i,
    codes: ["42501"],
    title: "Não tem permissão para esta acção",
    fix: "Peça ao administrador da escola, em Acessos, a permissão do módulo ou o cargo adequado.",
    owner: "ao administrador da escola",
  },
  {
    id: "limit.rate",
    kind: "limit",
    match: /atingiu o limite|demasiados (pedidos|documentos)|too many requests|rate limit|\b429\b/i,
    fix: "Espere alguns minutos e tente outra vez. O limite protege a escola contra abusos.",
  },
  {
    id: "network.offline",
    kind: "network",
    match:
      /failed to fetch|networkerror|network request failed|fetch failed|load failed|sem ligação|offline|ERR_INTERNET/i,
    title: "Sem ligação ao servidor",
    fix: "Confirme a internet (Wi-Fi ou dados móveis) e tente outra vez. O que escreveu não se perdeu.",
  },
  {
    id: "network.timeout",
    kind: "network",
    match: /timeout|timed out|demorou demasiado|\b504\b|bad gateway/i,
    title: "O servidor demorou a responder",
    fix: "Tente outra vez dentro de instantes; se a operação for grande, reduza o período ou o número de linhas.",
  },

  /* ───────────── Últimos recursos (genéricos) ───────────── */
  {
    id: "process.validation",
    kind: "process",
    match:
      /obrigatóri|inválid|deve ser|deve ter|deve incluir|precisa de|tem de |não pode (ser|ficar|estar)|formato|no máximo|no mínimo|maior que|menor que|entre \d/i,
    fix: "Corrija o campo indicado no formulário e guarde outra vez.",
  },
  {
    id: "generic.failed",
    kind: "process",
    match: /^(não foi possível|não consegui|falha|falhou|erro)\b/i,
    fix: "Tente outra vez dentro de instantes. Se voltar a falhar, abra Configurações → Diagnóstico e envie o relatório ao suporte.",
    action: TO_DIAGNOSTICS,
  },
];

/** Texto e código de um erro qualquer (Error, objecto do Supabase, string). */
export function errorParts(error: unknown): { message: string; code: string | null } {
  if (typeof error === "string") return { message: error, code: null };
  if (!error || typeof error !== "object") return { message: "", code: null };
  const candidate = error as { message?: unknown; code?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const code =
    typeof candidate.code === "string" || typeof candidate.code === "number"
      ? String(candidate.code)
      : null;
  return { message, code };
}

/** Título quando a mensagem é técnica e a regra não traz um próprio. */
const KIND_TITLES: Record<GuidanceKind, string> = {
  config: "Falta configurar um passo da escola",
  process: "Não foi possível concluir esta operação",
  permission: "Não tem permissão para esta acção",
  session: "A sua sessão terminou",
  network: "Sem ligação ao servidor",
  limit: "Muitos pedidos seguidos",
  unavailable: "Esta função não está disponível agora",
};

/** Orientação para um erro, ou `null` quando não há nenhuma regra para ele. */
export function guidanceFor(error: unknown): Guidance | null {
  const { message, code } = errorParts(error);
  if (!message && !code) return null;
  const technical = !message || isTechnicalMessage(message);
  for (const rule of RULES) {
    if ((code && rule.codes?.includes(code)) || (message && rule.match.test(message))) {
      return {
        id: rule.id,
        kind: rule.kind,
        title: technical ? (rule.title ?? KIND_TITLES[rule.kind]) : null,
        fix: rule.fix,
        action: rule.action,
        owner: rule.owner,
      };
    }
  }
  return null;
}

/** Caminho do destino, para confirmar se a pessoa tem acesso a ele. */
export function guidanceActionPath(action: GuidanceAction): string {
  return action.kind === "settings" ? "/configuracoes" : action.to;
}

/**
 * Texto da correcção para quem **não** pode abrir o destino: em vez do
 * botão, diz a quem pedir.
 */
export function guidanceFixFor(guidance: Guidance, canOpenAction: boolean): string {
  if (canOpenAction || !guidance.action || !guidance.owner) return guidance.fix;
  return `${guidance.fix} Se não tiver acesso, peça ${guidance.owner}.`;
}

/** Só para testes: os identificadores das regras, pela ordem em que são testadas. */
export const GUIDANCE_RULE_IDS = RULES.map((rule) => rule.id);
