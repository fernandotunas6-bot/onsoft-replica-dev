import { normalizeText, foldForCompare } from "./normalize";
import type { ImportModule } from "../schemas";

export type FieldDataType = "text" | "date" | "number" | "boolean" | "select" | "email" | "phone";

export interface FieldDefinition {
  key: string;
  label: string;
  description: string;
  type: FieldDataType;
  required: boolean;
  recommended?: boolean;
  aliases: string[];
  options?: string[];
  example?: string;
  transform?: (value: unknown) => unknown;
  validate?: (value: unknown) => string | null;
}

export interface ModuleFieldCatalog {
  module: ImportModule;
  label: string;
  description: string;
  naturalKey: string[];
  fields: FieldDefinition[];
}

/**
 * Catálogo mestre de campos suportados pelo SIGA com regras de aliases
 * abrangentes para tolerância total a planilhas legadas angolanas e internacionais.
 */
export const FIELD_CATALOG: Record<string, ModuleFieldCatalog> = {
  pessoas: {
    module: "pessoas",
    label: "Pessoas & Encarregados",
    description: "Diretório de pessoas físicas, encarregados e contactos da instituição",
    naturalKey: ["national_id", "full_name"],
    fields: [
      {
        key: "full_name",
        label: "Nome Completo",
        description: "Nome completo da pessoa física",
        type: "text",
        required: true,
        example: "Esperança Manuel da Costa",
        aliases: [
          "nome",
          "nome completo",
          "nome da pessoa",
          "pessoa",
          "full name",
          "name",
          "nome_completo",
          "designacao",
          "titular",
        ],
      },
      {
        key: "national_id",
        label: "Bilhete de Identidade / Cédula",
        description: "Número do Bilhete de Identidade (ex: 14 dígitos), Cédula ou Passaporte",
        type: "text",
        required: false,
        recommended: true,
        example: "005432190LA048",
        aliases: [
          "bi",
          "b.i.",
          "b.i",
          "bilhete",
          "bilhete de identidade",
          "n bilhete",
          "no bilhete",
          "num bilhete",
          "cedula",
          "cedula pessoal",
          "passaporte",
          "documento",
          "n documento",
          "numero documento",
          "id number",
          "national id",
          "identificacao",
        ],
      },
      {
        key: "gender",
        label: "Gênero / Sexo",
        description: "Gênero (M para Masculino, F para Feminino)",
        type: "select",
        required: false,
        options: ["M", "F"],
        example: "F",
        aliases: [
          "genero",
          "género",
          "sexo",
          "gender",
          "sex",
          "m_f",
          "m/f",
        ],
      },
      {
        key: "birth_date",
        label: "Data de Nascimento",
        description: "Data de nascimento no formato AAAA-MM-DD",
        type: "date",
        required: false,
        recommended: true,
        example: "1998-05-14",
        aliases: [
          "data de nascimento",
          "data nascimento",
          "nascimento",
          "d.n.",
          "dn",
          "dt nascimento",
          "birth date",
          "dob",
          "data_nasc",
        ],
      },
      {
        key: "phone",
        label: "Telefone / Telemóvel",
        description: "Número de telefone ou telemóvel para contacto",
        type: "phone",
        required: false,
        example: "923123456",
        aliases: [
          "telefone",
          "telemovel",
          "telemóvel",
          "contacto",
          "celular",
          "phone",
          "mobile",
          "tel",
          "whatsapp",
        ],
      },
      {
        key: "email",
        label: "Correio Electrónico (E-mail)",
        description: "Endereço de e-mail institucional ou pessoal",
        type: "email",
        required: false,
        example: "esperanca.costa@escola.ao",
        aliases: [
          "email",
          "e-mail",
          "correio electronico",
          "correio eletrónico",
          "mail",
          "contacto electronico",
        ],
      },
      {
        key: "address",
        label: "Endereço / Residência",
        description: "Endereço residencial, bairro e município",
        type: "text",
        required: false,
        example: "Bairro Morro Bento, Rua 5, Casa 12",
        aliases: [
          "endereco",
          "endereço",
          "residencia",
          "residência",
          "bairro",
          "morada",
          "address",
        ],
      },
    ],
  },
  alunos: {
    module: "alunos",
    label: "Alunos & Estudantes",
    description: "Ficha cadastral de alunos, número de processo e dados de encarregado",
    naturalKey: ["student_number", "id_number", "full_name"],
    fields: [
      {
        key: "full_name",
        label: "Nome Completo do Aluno",
        description: "Nome oficial do estudante para emissão de pautas e certificados",
        type: "text",
        required: true,
        example: "Manuel João da Silva",
        aliases: [
          "nome",
          "nome completo",
          "nome do aluno",
          "nome do estudante",
          "aluno",
          "estudante",
          "student name",
          "full name",
          "nome_aluno",
        ],
      },
      {
        key: "student_number",
        label: "Nº de Processo / Nº Aluno",
        description: "Número de processo escolar único na instituição",
        type: "text",
        required: false,
        recommended: true,
        example: "2026-0042",
        aliases: [
          "n processo",
          "no processo",
          "numero de processo",
          "numero processo",
          "nº processo",
          "processo",
          "n aluno",
          "no aluno",
          "nº aluno",
          "numero aluno",
          "numero do aluno",
          "matricula",
          "n matricula",
          "student number",
          "student id",
          "cod aluno",
          "codigo aluno",
        ],
      },
      {
        key: "id_number",
        label: "Bilhete de Identidade / Cédula",
        description: "Número do BI, Cédula pessoal ou Passaporte",
        type: "text",
        required: false,
        recommended: true,
        example: "006789123LA033",
        aliases: [
          "bi",
          "b.i.",
          "b.i",
          "bilhete",
          "bilhete de identidade",
          "cedula",
          "cedula pessoal",
          "documento",
          "n documento",
          "national id",
        ],
      },
      {
        key: "gender",
        label: "Gênero / Sexo",
        description: "Gênero (M para Masculino, F para Feminino)",
        type: "select",
        required: true,
        options: ["M", "F"],
        example: "M",
        aliases: [
          "genero",
          "género",
          "sexo",
          "gender",
          "sex",
          "m_f",
          "m/f",
        ],
      },
      {
        key: "birth_date",
        label: "Data de Nascimento",
        description: "Data de nascimento (AAAA-MM-DD)",
        type: "date",
        required: false,
        recommended: true,
        example: "2010-08-12",
        aliases: [
          "data de nascimento",
          "data nascimento",
          "nascimento",
          "d.n.",
          "dn",
          "birth date",
          "dob",
        ],
      },
      {
        key: "guardian_name",
        label: "Nome do Encarregado de Educação",
        description: "Nome completo do pai, mãe ou tutor legal",
        type: "text",
        required: false,
        recommended: true,
        example: "António da Silva",
        aliases: [
          "encarregado",
          "nome do encarregado",
          "encarregado de educacao",
          "encarregado de educação",
          "pai",
          "mae",
          "mãe",
          "tutor",
          "responsavel",
          "responsável",
          "guardian",
          "guardian name",
        ],
      },
      {
        key: "guardian_phone",
        label: "Telefone do Encarregado",
        description: "Contacto telefónico principal para avisos e notificações",
        type: "phone",
        required: false,
        recommended: true,
        example: "924112233",
        aliases: [
          "telefone do encarregado",
          "telemovel do encarregado",
          "contacto do encarregado",
          "tel encarregado",
          "guardian phone",
          "telefone encarregado",
        ],
      },
      {
        key: "guardian_relationship",
        label: "Grau de Parentesco",
        description: "Parentesco com o aluno (Pai, Mãe, Tio, Avô, etc.)",
        type: "text",
        required: false,
        example: "Pai",
        aliases: [
          "parentesco",
          "grau de parentesco",
          "relacao",
          "relação",
          "relationship",
        ],
      },
      {
        key: "class_group",
        label: "Turma de Inscrição / Alocação",
        description: "Nome da turma inicial a alocar",
        type: "text",
        required: false,
        recommended: true,
        example: "10ª A Manhã",
        aliases: [
          "turma",
          "nome da turma",
          "turma inicial",
          "class",
          "class group",
          "classe/turma",
        ],
      },
      {
        key: "address",
        label: "Residência / Bairro",
        description: "Localidade ou bairro de residência do aluno",
        type: "text",
        required: false,
        example: "Talatona, Sector 4",
        aliases: [
          "endereco",
          "endereço",
          "residencia",
          "residência",
          "bairro",
          "morada",
        ],
      },
    ],
  },
  professores: {
    module: "professores",
    label: "Professores & Corpo Docente",
    description: "Cadastro de docentes, especialidades e números de agente",
    naturalKey: ["employee_number", "national_id", "full_name"],
    fields: [
      {
        key: "full_name",
        label: "Nome Completo do Docente",
        description: "Nome oficial do professor",
        type: "text",
        required: true,
        example: "Dr. Paulino Afonso Manuel",
        aliases: [
          "nome",
          "nome completo",
          "nome do professor",
          "nome do docente",
          "professor",
          "docente",
          "teacher name",
          "teacher",
        ],
      },
      {
        key: "employee_number",
        label: "Nº de Agente / Registo Docente",
        description: "Número mecânico ou de agente do Ministério da Educação",
        type: "text",
        required: false,
        recommended: true,
        example: "AG-89420",
        aliases: [
          "n agente",
          "no agente",
          "nº agente",
          "numero de agente",
          "agente",
          "n mecanico",
          "numero mecanico",
          "registo",
          "employee number",
          "teacher id",
          "cod professor",
        ],
      },
      {
        key: "national_id",
        label: "Bilhete de Identidade",
        description: "Número do BI nacional",
        type: "text",
        required: false,
        recommended: true,
        example: "001234567LA012",
        aliases: ["bi", "b.i.", "bilhete", "bilhete de identidade", "documento"],
      },
      {
        key: "gender",
        label: "Gênero / Sexo",
        description: "Gênero (M/F)",
        type: "select",
        required: false,
        options: ["M", "F"],
        example: "M",
        aliases: ["genero", "género", "sexo", "gender"],
      },
      {
        key: "phone",
        label: "Telefone de Contacto",
        description: "Contacto telefónico institucional ou móvel",
        type: "phone",
        required: false,
        recommended: true,
        example: "923998877",
        aliases: ["telefone", "telemovel", "contacto", "phone", "mobile"],
      },
      {
        key: "email",
        label: "Correio Electrónico (E-mail)",
        description: "Email de acesso ao portal do professor",
        type: "email",
        required: false,
        recommended: true,
        example: "paulino.manuel@escola.ao",
        aliases: ["email", "e-mail", "mail"],
      },
      {
        key: "specialty",
        label: "Especialidade / Formação",
        description: "Área de especialização (ex: Matemática, Física)",
        type: "text",
        required: false,
        example: "Licenciatura em Ensino da Matemática",
        aliases: [
          "especialidade",
          "formacao",
          "formação",
          "habilitacao",
          "habilitação",
          "area",
          "área",
          "qualificacao",
        ],
      },
    ],
  },
  turmas: {
    module: "turmas",
    label: "Turmas & Salas",
    description: "Estrutura de turmas, salas, turnos e capacidades",
    naturalKey: ["name"],
    fields: [
      {
        key: "name",
        label: "Nome da Turma",
        description: "Designação oficial da turma (ex: 10ª A Manhã)",
        type: "text",
        required: true,
        example: "10ª A Manhã",
        aliases: [
          "nome",
          "nome da turma",
          "turma",
          "designacao",
          "class group",
          "class name",
        ],
      },
      {
        key: "code",
        label: "Código da Turma",
        description: "Código identificador curto",
        type: "text",
        required: false,
        example: "10A-M",
        aliases: ["codigo", "código", "sigla", "code", "cod turma"],
      },
      {
        key: "grade_level",
        label: "Classe / Grau",
        description: "Classe de ensino (ex: 1ª Classe, 10ª Classe)",
        type: "text",
        required: false,
        recommended: true,
        example: "10ª Classe",
        aliases: ["classe", "grau", "ano", "nivel", "nível", "grade level", "grade"],
      },
      {
        key: "shift",
        label: "Turno / Período",
        description: "Turno escolar (Manhã, Tarde, Noite)",
        type: "select",
        required: false,
        options: ["Manhã", "Tarde", "Noite"],
        example: "Manhã",
        aliases: ["turno", "periodo", "período", "shift"],
      },
      {
        key: "room",
        label: "Sala de Aula",
        description: "Designação da sala física",
        type: "text",
        required: false,
        example: "Sala 04",
        aliases: ["sala", "sala de aula", "room", "classroom"],
      },
      {
        key: "capacity",
        label: "Lotação / Capacidade",
        description: "Capacidade máxima de alunos na sala",
        type: "number",
        required: false,
        example: "45",
        aliases: ["capacidade", "lotacao", "lotação", "vagas", "capacity", "max alunos"],
      },
    ],
  },
  matriculas: {
    module: "matriculas",
    label: "Matrículas & Confirmações",
    description: "Vínculo de alunos a turmas no ano lectivo ativo",
    naturalKey: ["student_identifier", "class_group"],
    fields: [
      {
        key: "student_identifier",
        label: "Identificador do Aluno (Nº Processo, BI ou Nome)",
        description: "Processo, documento nacional ou nome para localizar o estudante",
        type: "text",
        required: true,
        example: "2026-0042",
        aliases: [
          "aluno",
          "estudante",
          "n processo",
          "processo",
          "n aluno",
          "bi",
          "identificador",
          "student",
          "student number",
        ],
      },
      {
        key: "class_group",
        label: "Nome da Turma",
        description: "Turma em que o aluno será matriculado",
        type: "text",
        required: true,
        example: "10ª A Manhã",
        aliases: ["turma", "nome da turma", "classe/turma", "class group", "class"],
      },
      {
        key: "enrollment_date",
        label: "Data da Matrícula",
        description: "Data em que foi efectuada a matrícula ou confirmação (AAAA-MM-DD)",
        type: "date",
        required: false,
        example: "2026-01-15",
        aliases: [
          "data de matricula",
          "data matricula",
          "data da matricula",
          "data",
          "enrollment date",
        ],
      },
      {
        key: "status",
        label: "Estado da Matrícula",
        description: "Situação (active / activa, pendente, transferido, cancelada)",
        type: "select",
        required: false,
        options: ["active", "pending", "transferred", "cancelled"],
        example: "active",
        aliases: ["estado", "status", "situacao", "situação"],
      },
    ],
  },
  notas: {
    module: "notas",
    label: "Notas, Pautas & Avaliações",
    description: "Lançamento de notas por disciplina e trimestre na escala de Angola (0-20)",
    naturalKey: ["student_identifier", "subject", "term"],
    fields: [
      {
        key: "student_identifier",
        label: "Identificador do Aluno (Processo ou Nome)",
        description: "Nº de processo, BI ou nome completo do aluno na turma",
        type: "text",
        required: true,
        example: "2026-0042",
        aliases: [
          "aluno",
          "estudante",
          "n processo",
          "processo",
          "n aluno",
          "nome",
          "student",
        ],
      },
      {
        key: "class_group",
        label: "Turma",
        description: "Turma do aluno",
        type: "text",
        required: false,
        recommended: true,
        example: "10ª A Manhã",
        aliases: ["turma", "class group", "class"],
      },
      {
        key: "subject",
        label: "Disciplina / Cadeira",
        description: "Nome ou sigla da disciplina escolar (ex: Matemática, Língua Portuguesa)",
        type: "text",
        required: true,
        example: "Matemática",
        aliases: [
          "disciplina",
          "materia",
          "matéria",
          "cadeira",
          "subject",
          "sigla",
        ],
      },
      {
        key: "term",
        label: "Trimestre / Período",
        description: "Período de avaliação (ex: 1º Trimestre, 2º Trimestre, 3º Trimestre)",
        type: "text",
        required: false,
        recommended: true,
        example: "1º Trimestre",
        aliases: [
          "trimestre",
          "periodo",
          "período",
          "term",
          "epoca",
          "época",
        ],
      },
      {
        key: "mac",
        label: "MAC (Média de Avaliação Contínua)",
        description: "Nota de avaliação contínua (0 a 20)",
        type: "number",
        required: false,
        example: "14.5",
        aliases: ["mac", "continua", "av continua", "avaliacao continua"],
      },
      {
        key: "npp",
        label: "NPP (Nota da Prova do Professor)",
        description: "Nota da prova parcelar do professor (0 a 20)",
        type: "number",
        required: false,
        example: "13.0",
        aliases: ["npp", "prova professor", "prova do professor", "prova de professor", "parcelar", "teste"],
      },
      {
        key: "npt",
        label: "NPT (Nota da Prova Trimestral)",
        description: "Nota da prova trimestral unificada (0 a 20)",
        type: "number",
        required: false,
        example: "15.0",
        aliases: ["npt", "prova trimestral", "prova do trimestre", "trimestral", "exame trimestral"],
      },
      {
        key: "grade",
        label: "Nota / Média Final do Período",
        description: "Classificação final do período no padrão curricular",
        type: "number",
        required: false,
        recommended: true,
        example: "14.2",
        aliases: ["nota", "media", "média", "classificacao", "score", "grade"],
      },
    ],
  },
};

function stripStopWords(text: string): string {
  return text.replace(/\b(de|do|da|dos|das|no|na)\b/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Encontra a melhor correspondência de coluna com base nos aliases do catálogo.
 */
export function findCatalogMatch(
  header: string,
  moduleCatalog: ModuleFieldCatalog,
): { field: FieldDefinition; confidence: number } | null {
  const normHeader = foldForCompare(header);
  if (!normHeader) return null;
  const strippedHeader = stripStopWords(normHeader);

  for (const field of moduleCatalog.fields) {
    const normKey = foldForCompare(field.key);
    const normLabel = foldForCompare(field.label);

    // Correspondência exata de key ou label
    if (normHeader === normKey || normHeader === normLabel) {
      return { field, confidence: 1.0 };
    }

    // Correspondência exata com algum alias
    for (const alias of field.aliases) {
      const normAlias = foldForCompare(alias);
      if (normHeader === normAlias || strippedHeader === stripStopWords(normAlias)) {
        return { field, confidence: 0.95 };
      }
    }

    // Correspondência parcial (inclusão de substring)
    for (const alias of field.aliases) {
      const normAlias = foldForCompare(alias);
      if (normHeader.includes(normAlias) || normAlias.includes(normHeader)) {
        return { field, confidence: 0.75 };
      }
    }
  }

  return null;
}
