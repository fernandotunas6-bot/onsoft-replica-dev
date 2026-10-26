import { sqlApplyHint } from "@/lib/sql-doc-hint";

type DatabaseError = {
  code?: string | undefined;
  message?: string | undefined;
};

const publicMessages: Record<string, string> = {
  "23503": "O registo depende de dados que não existem ou já foram removidos.",
  "23505": "Já existe um registo com estes dados.",
  "23514": "Um ou mais valores não respeitam as regras do sistema.",
  "42501": "Não tem permissão para realizar esta operação.",
  "42P01": `Tabela em falta no SGA. ${sqlApplyHint("premium")}`,
  PGRST116: "O registo solicitado não foi encontrado.",
};

/**
 * Regras da base com mensagem própria: dizem o que corrigir, sem revelar a
 * estrutura. A chave é o nome da restrição, que vem na mensagem do Postgres.
 */
const constraintMessages: Record<string, string> = {
  course_unit_enrollments_unique:
    "O estudante já tem um registo nesta cadeira neste ano lectivo (mesmo anulado). Altere esse registo em vez de criar outro.",
  people_school_email_uidx: "Já existe uma pessoa com este e-mail nesta escola.",
  people_school_national_id_uidx: "Já existe uma pessoa com este BI nesta escola.",
  people_one_active_login_per_school: "Esta conta já está ligada a outra pessoa nesta escola.",
  people_phone_check:
    "Telefone inválido. Use só dígitos, espaços ou hífen (ex.: +244 923 000 000).",
  people_email_check: "E-mail inválido.",
  people_full_name_check: "O nome deve ter entre 2 e 200 caracteres.",
  people_date_of_birth_check: "A data de nascimento não pode ser no futuro.",
  people_national_id_check: "O BI deve ter entre 3 e 40 caracteres.",
  students_school_id_person_id_key: "Esta pessoa já está registada como aluno.",
  students_school_id_student_number_key: "Já existe um aluno com este número.",
  teachers_school_id_person_id_key: "Esta pessoa já está registada como professor.",
  teachers_school_id_employee_number_key: "Já existe um professor com este número.",
  teachers_one_login_per_school: "Esta conta já está ligada a outro professor nesta escola.",
  enrollments_one_current_per_year_uidx: "O aluno já tem uma matrícula activa neste ano lectivo.",
  class_groups_school_id_academic_year_id_code_key:
    "Já existe uma turma com este código neste ano.",
  class_groups_code_check:
    "O código da turma usa só maiúsculas, dígitos, hífen ou sublinhado (2 a 30).",
  class_groups_capacity_check: "A lotação da turma deve ser entre 1 e 500.",
  subjects_school_id_code_key: "Já existe uma disciplina com este código.",
  subjects_code_check:
    "O código da disciplina usa só maiúsculas, dígitos, hífen ou sublinhado (2 a 20).",
  academic_years_school_id_name_key: "Já existe um ano lectivo com este nome.",
  academic_years_check: "O fim do ano lectivo tem de ser depois do início.",
  terms_check: "O fim do período tem de ser depois do início.",
  terms_school_id_academic_year_id_sequence_key: "Este período já existe neste ano lectivo.",
  rooms_school_code_key: "Já existe uma sala com este código.",
  student_guardians_one_primary_uidx: "O aluno já tem um encarregado principal.",
  student_guardians_check1: "O aluno não pode ser o seu próprio encarregado.",
};

/**
 * Mensagens de regras de negócio levantadas pela própria base (RAISE nos gatilhos e
 * funções), escritas para o utilizador: passam tal como estão. Sem esta lista, a da
 * lotação chegava ao ecrã como «Um ou mais valores não respeitam as regras».
 */
const businessMessages = new Set([
  "A matrícula mudou. Reveja a organização das turmas.",
  "Este aluno já tem registos académicos. Não pode ser reorganizado por idade.",
  "O período está fechado.",
  "A pauta deste período já é oficial.",
  "Esta entrega já foi devolvida ou não existe.",
  "A avaliação não pertence à turma e disciplina da tarefa.",
  "A nota não respeita a cotação da avaliação.",
  "Há alunos que não são da turma desta avaliação.",
  // Gatilho 20261025090000: segunda propina do mesmo mês, em emissões paralelas.
  "Este aluno já tem a propina deste mês. Anule-a antes de emitir outra.",
  // Publicação atómica do horário (20261025121012).
  "Sem autorização para publicar o horário.",
  "Turma ou ano lectivo inválido para publicar.",
  "O ano lectivo não aceita publicação de horários.",
  "A validade do horário tem de estar dentro do ano lectivo.",
  "O nome do horário é demasiado longo.",
  "Configure os períodos lectivos antes de publicar o horário.",
  "Associe disciplinas activas à turma antes de publicar o horário.",
  "Atribua docentes e disciplinas activos antes de publicar o horário.",
  "A carga semanal do horário não corresponde às disciplinas da turma.",
  "Resolva os conflitos de turma, docente ou sala antes de publicar.",
  "Adicione pelo menos uma aula activa antes de publicar o horário.",
  "O horário mudou durante a publicação; tente novamente.",
  "A turma atingiu a capacidade configurada.",
  "A turma nova tem de ser da mesma escola e do mesmo ano lectivo da matrícula.",
  "Turma ativa inválida para esta escola.",
  "Identidade da matrícula é imutável.",
  // register_student / enroll_student
  "Estudante, ano letivo ou data de matrícula inválida.",
  "Pessoa ou data de admissão inválida.",
  "Encarregado inválido para esta escola.",
  // register_teacher
  "Dados funcionais ou pessoa inválida.",
  "Existe disciplina inválida ou pertencente a outra escola.",
  // merge_people (20261010110000)
  "Seleccione duas pessoas diferentes.",
  "Uma das pessoas não existe nesta escola.",
  "As duas fichas têm contas de acesso diferentes. Não é seguro fundi-las — desactive o duplicado.",
  "As duas fichas têm matrícula de aluno. Não é seguro fundi-las — desactive o duplicado.",
  "As duas fichas têm vínculo laboral (RH). Não é seguro fundi-las — desactive o duplicado.",
  "As duas fichas têm registo de professor. Não é seguro fundi-las — desactive o duplicado.",
  // register_payment: sem isto, pagar a mais dizia só «Não foi possível registrar».
  "Fatura inválida, cancelada ou já paga.",
  "O valor do pagamento excede o saldo em aberto da fatura.",
  "Esta chave de pagamento já foi usada noutro pagamento.",
  // Sessões de caixa (20261024110000_finance_cash_sessions.sql).
  "Abra o caixa antes de registar numerário.",
  "Indique o fundo de maneio contado.",
  "O caixa já está aberto.",
  "Indique o numerário contado.",
  "Este caixa já não está aberto.",
  "Indique o motivo da diferença de caixa.",
  "Não há diferença por aprovar neste caixa.",
  "Só quem abriu o caixa, ou um Administrador, o pode fechar.",
  "Só um Administrador aprova diferenças de caixa.",
  "Quem fechou o caixa não pode aprovar a diferença.",
  "Indique o valor depositado.",
  "Indique o nº do talão de depósito.",
  "Abra o caixa antes de depositar.",
  "O depósito é maior do que o numerário na gaveta.",
  "Este talão de depósito já está registado.",
  "Indique o motivo da anulação do depósito.",
  "Depósito não encontrado ou já anulado.",
  "Este depósito já foi confirmado no extracto e não se anula.",
  "O caixa deste depósito já fechou: a diferença fica no fecho.",
  "Não há depósito por confirmar com este número.",
  "Quem registou o depósito não o pode confirmar.",
  // Gatilho das mensagens (20261002100000_chat_integrity.sql).
  "Conversa inexistente.",
  "A mensagem tem de pertencer à escola da conversa.",
  "O anexo tem de ser um ficheiro da escola da conversa.",
  "Só pode responder a mensagens da mesma conversa.",

  "A turma tem de pertencer à escola e ao ano lectivo seleccionados.",
  "Este pedido já foi concluído com outros dados. Abra uma nova matrícula.",
  "Indique encarregados distintos e apenas um principal.",
  "Encarregado inválido para esta escola.",
  "A data de admissão não pode ser futura.",
  "Ano lectivo não encontrado.",
  "Indique o nome e as datas válidas do ano lectivo.",
  "Limite de alunos do plano atingido. Actualize o plano no portal comercial SIGA Plus.",
]);

function constraintMessage(message: string | undefined): string | null {
  const name = /constraint "([a-z0-9_]+)"/i.exec(message ?? "")?.[1];
  return (name && constraintMessages[name]) || null;
}

/** Função ainda por criar nesta base (migração por aplicar): quem chama segue o caminho antigo. */
export function isMissingFunction(error: DatabaseError | null | undefined): boolean {
  return Boolean(
    error &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      /could not find the function|function .* does not exist/i.test(error.message ?? "")),
  );
}

/** Tabela ainda por criar nesta base (migração por aplicar): quem lê trata-a como vazia. */
export function isMissingTable(error: DatabaseError | null | undefined): boolean {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      // Só a tabela: «column … does not exist» (42703) ou uma função em falta são erros
      // a mostrar, não «sem dados».
      /relation .* does not exist|could not find the table/i.test(error.message ?? "")),
  );
}

/**
 * A base recusou por falta de 2FA (`private.is_aal2`) ou de permissão: as funções
 * SECURITY DEFINER levantam 42501 «Sem autorização…». Uma só regra para o
 * servidor traduzir a recusa em «active o 2FA» (havia seis cópias, com
 * expressões diferentes).
 */
export function isRpcAuthDenied(error: DatabaseError | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42501" ||
    /is_aal2|autoriza[çc][ãa]o|permission denied/i.test(error.message ?? "")
  );
}

/** Prevent database structure and raw SQL details from reaching browser clients. */
export function publicDatabaseError(error: DatabaseError, fallback: string): Error {
  // A mensagem devolvida ao browser é deliberadamente vaga; sem este registo
  // no servidor um 23502/23503 fica invisível para quem depura.
  if (typeof window === "undefined") {
    // Mensagens PG podem incluir valores de BI/e-mail ou SQL. Conservar só
    // o código e o nome de uma restrição conhecida, nunca o texto bruto.
    const code = /^[A-Z0-9]{5,10}$/.test(error.code ?? "") ? error.code : "unknown";
    const name = /constraint "([a-z0-9_]+)"/i.exec(error.message ?? "")?.[1];
    console.error(
      "[db] code=%s constraint=%s",
      code,
      name && constraintMessages[name] ? name : "unknown",
    );
  }
  const missingTable =
    error.code === "42P01" ||
    /schema cache|does not exist|relation .* does not exist/i.test(String(error.message ?? ""));
  if (missingTable) {
    return new Error(publicMessages["42P01"] ?? fallback);
  }
  const raised = String(error.message ?? "").trim();
  if (businessMessages.has(raised)) return new Error(raised);
  if (error.code === "23505" || error.code === "23514") {
    const specific = constraintMessage(error.message);
    if (specific) return new Error(specific);
  }
  return new Error((error.code && publicMessages[error.code]) || fallback);
}
