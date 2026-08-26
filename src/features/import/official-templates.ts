import type { ImportModule } from "./schemas";

export interface OfficialTemplateColumn {
  header: string;
  key: string;
  required: boolean;
  type: "text" | "date" | "number" | "select";
  description: string;
  example: string;
}

export interface OfficialTemplateSpec {
  module: ImportModule;
  label: string;
  filename: string;
  columns: OfficialTemplateColumn[];
}

export const OFFICIAL_TEMPLATES: Record<string, OfficialTemplateSpec> = {
  pessoas: {
    module: "pessoas",
    label: "Modelo de Pessoas",
    filename: "Modelo_Pessoas_SIGA.csv",
    columns: [
      {
        header: "Nome Completo",
        key: "full_name",
        required: true,
        type: "text",
        description: "Nome completo da pessoa",
        example: "Maria Fernanda da Silva",
      },
      {
        header: "Bilhete de Identidade / Cédula",
        key: "national_id",
        required: false,
        type: "text",
        description: "Nº de BI ou Cédula Pessoal",
        example: "005432190LA048",
      },
      {
        header: "Gênero",
        key: "gender",
        required: false,
        type: "select",
        description: "M para Masculino, F para Feminino",
        example: "F",
      },
      {
        header: "Data de Nascimento",
        key: "birth_date",
        required: false,
        type: "date",
        description: "Formato AAAA-MM-DD",
        example: "1985-03-22",
      },
      {
        header: "E-mail",
        key: "email",
        required: false,
        type: "text",
        description: "Correio eletrónico",
        example: "maria.silva@escola.ao",
      },
      {
        header: "Telefone",
        key: "phone",
        required: false,
        type: "text",
        description: "Telefone de contacto",
        example: "923112233",
      },
    ],
  },
  alunos: {
    module: "alunos",
    label: "Modelo de Alunos",
    filename: "Modelo_Alunos_SIGA.csv",
    columns: [
      {
        header: "Nome Completo",
        key: "full_name",
        required: true,
        type: "text",
        description: "Nome completo do aluno",
        example: "João Manuel António",
      },
      {
        header: "Bilhete de Identidade / Cédula",
        key: "id_number",
        required: false,
        type: "text",
        description: "Nº de BI ou Cédula Pessoal",
        example: "005432190LA048",
      },
      {
        header: "Gênero",
        key: "gender",
        required: true,
        type: "select",
        description: "M para Masculino, F para Feminino",
        example: "M",
      },
      {
        header: "Data de Nascimento",
        key: "birth_date",
        required: true,
        type: "date",
        description: "Formato AAAA-MM-DD",
        example: "2012-05-14",
      },
      {
        header: "Telefone",
        key: "phone",
        required: false,
        type: "text",
        description: "Telefone de contacto",
        example: "923112233",
      },
      {
        header: "Encarregado",
        key: "guardian_name",
        required: false,
        type: "text",
        description: "Nome do pai/mãe/encarregado",
        example: "Manuel António",
      },
      {
        header: "Turma",
        key: "class_group",
        required: false,
        type: "text",
        description: "Nome da Turma (ex.: 7A, 10ª B)",
        example: "7A",
      },
    ],
  },
  professores: {
    module: "professores",
    label: "Modelo de Professores",
    filename: "Modelo_Professores_SIGA.csv",
    columns: [
      {
        header: "Nome Completo",
        key: "full_name",
        required: true,
        type: "text",
        description: "Nome completo do docente",
        example: "Maria Fernanda da Silva",
      },
      {
        header: "Nº BI / Documento",
        key: "id_number",
        required: true,
        type: "text",
        description: "Documento de identificação",
        example: "001234567LA032",
      },
      {
        header: "E-mail",
        key: "email",
        required: false,
        type: "text",
        description: "Correio eletrónico institucional",
        example: "maria.silva@escola.ao",
      },
      {
        header: "Telefone",
        key: "phone",
        required: true,
        type: "text",
        description: "Nº de telefone de contacto",
        example: "934556677",
      },
      {
        header: "Especialidade / Disciplina",
        key: "specialty",
        required: false,
        type: "text",
        description: "Área de lecionação",
        example: "Matemática",
      },
    ],
  },
  matriculas: {
    module: "matriculas",
    label: "Modelo de Matrículas",
    filename: "Modelo_Matriculas_SIGA.csv",
    columns: [
      {
        header: "Aluno (BI ou Processo)",
        key: "student_identifier",
        required: true,
        type: "text",
        description: "Nº de Processo ou BI do Aluno",
        example: "PROC-2026-042",
      },
      {
        header: "Turma",
        key: "class_group",
        required: true,
        type: "text",
        description: "Código/Nome da Turma",
        example: "10ª Classe A - Manhã",
      },
      {
        header: "Ano Lectivo",
        key: "academic_year",
        required: true,
        type: "text",
        description: "Ano escolar de referência",
        example: "2026",
      },
      {
        header: "Data da Matrícula",
        key: "enrollment_date",
        required: false,
        type: "date",
        description: "Data de inscrição",
        example: "2026-02-01",
      },
    ],
  },
  notas: {
    module: "notas",
    label: "Modelo de Notas e Avaliações",
    filename: "Modelo_Notas_SIGA.csv",
    columns: [
      {
        header: "Aluno (Processo ou BI)",
        key: "student_identifier",
        required: true,
        type: "text",
        description: "Identificação do Aluno",
        example: "005432190LA048",
      },
      {
        header: "Disciplina",
        key: "subject",
        required: true,
        type: "text",
        description: "Nome ou Código da Disciplina",
        example: "Física",
      },
      {
        header: "Período",
        key: "term",
        required: true,
        type: "text",
        description: "1º Trimestre, 2º Trimestre, etc.",
        example: "1º Trimestre",
      },
      {
        header: "MAC (Avaliação Contínua)",
        key: "mac",
        required: false,
        type: "number",
        description: "Nota contínua (0 a 20)",
        example: "15",
      },
      {
        header: "NPP (Prova Professor)",
        key: "npp",
        required: false,
        type: "number",
        description: "Nota da prova de professor",
        example: "14",
      },
      {
        header: "NPT (Prova Trimestral)",
        key: "npt",
        required: false,
        type: "number",
        description: "Nota da prova trimestral",
        example: "16",
      },
    ],
  },
  pagamentos: {
    module: "pagamentos",
    label: "Modelo de Pagamentos e Propinas",
    filename: "Modelo_Pagamentos_SIGA.csv",
    columns: [
      {
        header: "Aluno (Processo ou BI)",
        key: "student_identifier",
        required: true,
        type: "text",
        description: "Identificação do Aluno",
        example: "PROC-2026-042",
      },
      {
        header: "Mês / Referência",
        key: "month_ref",
        required: true,
        type: "text",
        description: "Mês da propina ou serviço",
        example: "Fevereiro 2026",
      },
      {
        header: "Valor Pago (Kz)",
        key: "amount",
        required: true,
        type: "number",
        description: "Valor em Kwanzas",
        example: "25000",
      },
      {
        header: "Data do Pagamento",
        key: "payment_date",
        required: true,
        type: "date",
        description: "Data de recepção",
        example: "2026-02-05",
      },
      {
        header: "Forma de Pagamento",
        key: "payment_method",
        required: false,
        type: "text",
        description: "TPA, Transferência, Multicaixas",
        example: "TPA Express",
      },
    ],
  },
};

export function generateOfficialCsvTemplate(moduleKey: string): string {
  const spec = OFFICIAL_TEMPLATES[moduleKey];
  if (!spec) return "Nome Completo;BI;Data Nascimento\nExemplo Silva;000000000LA000;2010-01-01\n";

  const headers = spec.columns.map((c) => c.header).join(";");
  const examples = spec.columns.map((c) => c.example).join(";");
  return `${headers}\n${examples}\n`;
}
