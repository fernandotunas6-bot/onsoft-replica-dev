export const PRINT_TEMPLATE_KEYS = [
  "talao-candidatura",
  "talao-matricula",
  "folha-credenciais",
  "dossie-academico",
  "service-document",
  "historico-academico-individual",
  "pauta-disciplinar",
  "pauta-geral-turma",
  "boletim-escolar",
  "certificado-habilitacoes",
  "diario-pedagogico-professor",
  "acta-conselho-notas",
  "declaracao-notas-simples",
  "relatorio-validacao-notas",
  "mapa-estatistico-aproveitamento",
] as const;

export type PrintTemplateKey = (typeof PRINT_TEMPLATE_KEYS)[number];

export const PRINT_TEMPLATE_META: Record<
  PrintTemplateKey,
  { title: string; type: string; description: string; sourceOfTruth: boolean }
> = {
  "talao-candidatura": {
    title: "Talão de candidatura",
    type: "admissions_receipt",
    description: "Comprovativo da candidatura pública.",
    sourceOfTruth: false,
  },
  "talao-matricula": {
    title: "Talão de matrícula",
    type: "enrollment_receipt",
    description: "Comprovativo de matrícula e credencial inicial.",
    sourceOfTruth: false,
  },
  "folha-credenciais": {
    title: "Folha de credenciais",
    type: "portal_credentials",
    description: "Acessos ao portal do aluno e encarregado.",
    sourceOfTruth: false,
  },
  "dossie-academico": {
    title: "Dossiê académico",
    type: "academic_dossier",
    description: "Pasta do processo do aluno na secretaria.",
    sourceOfTruth: false,
  },
  "service-document": {
    title: "Documento de serviço",
    type: "institutional_service_document",
    description: "Minuta institucional com fluxo de aprovação.",
    sourceOfTruth: false,
  },
  "historico-academico-individual": {
    title: "Histórico académico individual",
    type: "permanent_record",
    description: "Fonte oficial permanente das classificações.",
    sourceOfTruth: true,
  },
  "pauta-disciplinar": {
    title: "Pauta disciplinar",
    type: "subject_grade_sheet",
    description: "Pauta de uma disciplina na turma.",
    sourceOfTruth: false,
  },
  "pauta-geral-turma": {
    title: "Pauta geral da turma",
    type: "class_master_sheet",
    description: "Mapa de notas de todas as disciplinas.",
    sourceOfTruth: false,
  },
  "boletim-escolar": {
    title: "Boletim escolar",
    type: "report_card",
    description: "Boletim do período para o encarregado.",
    sourceOfTruth: false,
  },
  "certificado-habilitacoes": {
    title: "Certificado de habilitações",
    type: "certificate",
    description: "Certificado derivado do histórico oficial.",
    sourceOfTruth: false,
  },
  "diario-pedagogico-professor": {
    title: "Diário pedagógico",
    type: "teacher_pedagogic_log",
    description: "Registo de aulas do professor.",
    sourceOfTruth: false,
  },
  "acta-conselho-notas": {
    title: "Acta do conselho de notas",
    type: "academic_council_minutes",
    description: "Deliberações do conselho de turma.",
    sourceOfTruth: false,
  },
  "declaracao-notas-simples": {
    title: "Declaração de notas",
    type: "simple_grade_statement",
    description: "Declaração simples para efeitos externos.",
    sourceOfTruth: false,
  },
  "relatorio-validacao-notas": {
    title: "Relatório de validação",
    type: "grade_validation_report",
    description: "Conferência das notas lançadas.",
    sourceOfTruth: false,
  },
  "mapa-estatistico-aproveitamento": {
    title: "Mapa estatístico",
    type: "academic_statistics",
    description: "Aproveitamento por turma e curso.",
    sourceOfTruth: false,
  },
};

export function isPrintTemplateKey(value: string): value is PrintTemplateKey {
  return (PRINT_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function matchPrintTemplateKey(
  tipo: string,
  active?: { issue?: string; byType?: Record<string, string> },
): PrintTemplateKey {
  const normalized = tipo.trim().toLowerCase();
  const byType = active?.byType ?? {};

  const fromKeywords = (): PrintTemplateKey | null => {
    if (normalized.includes("boletim")) return "boletim-escolar";
    if (normalized.includes("certificado") || normalized.includes("habilita")) {
      return "certificado-habilitacoes";
    }
    if (normalized.includes("histórico") || normalized.includes("historico")) {
      return "historico-academico-individual";
    }
    if (normalized.includes("pauta") && normalized.includes("geral")) return "pauta-geral-turma";
    if (
      normalized.includes("pauta") &&
      (normalized.includes("trimestral") ||
        normalized.includes("anual") ||
        normalized.includes("lista") ||
        normalized.includes("relatório") ||
        normalized.includes("relatorio"))
    ) {
      return "service-document";
    }
    if (normalized.includes("relação") || normalized.includes("relacao")) {
      return "service-document";
    }
    if (normalized.includes("lista de notas")) return "service-document";
    if (normalized.includes("pauta")) return "pauta-disciplinar";
    if (normalized.includes("candidat")) return "talao-candidatura";
    if (normalized.includes("credenc")) return "folha-credenciais";
    if (normalized.includes("dossi") || normalized.includes("dossie")) return "dossie-academico";
    if (normalized.includes("acta") || normalized.includes("conselho")) return "acta-conselho-notas";
    if (normalized.includes("diário") || normalized.includes("diario")) {
      return "diario-pedagogico-professor";
    }
    if (normalized.includes("mapa") || normalized.includes("estatist")) {
      return "mapa-estatistico-aproveitamento";
    }
    if (normalized.includes("valida")) return "relatorio-validacao-notas";
    if (
      (normalized.includes("relatório") || normalized.includes("relatorio")) &&
      !normalized.includes("valida")
    ) {
      return "service-document";
    }
    if (
      normalized.includes("talão") ||
      normalized.includes("talao") ||
      normalized.includes("matrícul") ||
      normalized.includes("matricul")
    ) {
      return "talao-matricula";
    }
    if (
      normalized.includes("serviço") ||
      normalized.includes("servico") ||
      normalized.includes("recibo") ||
      normalized.includes("fatura") ||
      normalized.includes("caixa") ||
      normalized.includes("plano") ||
      normalized.includes("tesour") ||
      normalized.includes("finance") ||
      normalized.includes("comunicado") ||
      normalized.includes("calendário") ||
      normalized.includes("calendario") ||
      normalized.includes("lista de alunos") ||
      normalized.includes("lista de faturas") ||
      normalized.includes("lista de turmas") ||
      normalized.includes("lista de contas") ||
      normalized.includes("contas de login") ||
      normalized.includes("equipa escolar") ||
      normalized.includes("pedidos de documento") ||
      normalized.includes("registo de pessoas") ||
      normalized.includes("movimentos de caixa") ||
      normalized.includes("cobrança") ||
      normalized.includes("cobranca") ||
      normalized.includes("categoria") ||
      normalized.includes("pessoas") ||
      normalized.includes("professores")
    ) {
      return "service-document";
    }
    if (normalized.includes("declara")) return "declaracao-notas-simples";
    return null;
  };

  const keyed = fromKeywords();
  if (keyed) {
    const override = byType[PRINT_TEMPLATE_META[keyed].type];
    return override && isPrintTemplateKey(override) ? override : keyed;
  }

  const issue = active?.issue;
  if (issue && isPrintTemplateKey(issue)) return issue;
  return "declaracao-notas-simples";
}

export type PrintSchoolContext = {
  name: string;
  nif?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  directorName?: string | null;
  academicYear?: string | null;
  logoUrl?: string | null;
};

export type PrintStudentContext = {
  fullName: string;
  academicNumber: string;
  className?: string | null;
  programName?: string | null;
  documentTitle?: string;
  validationCode?: string;
};

export function buildPrintSamplePayload(
  school: PrintSchoolContext,
  extras?: { css?: string; student?: Partial<PrintStudentContext> },
): Record<string, unknown> {
  const year = school.academicYear || "2026/2027";
  const studentName = extras?.student?.fullName || "Ana Domingos Ferreira";
  const process = extras?.student?.academicNumber || "EST-2026-0142";
  const className = extras?.student?.className || "7ª A";
  const programName = extras?.student?.programName || "7.ª Classe · I Ciclo";
  const hash = extras?.student?.validationCode || "SIGA-DEMO-0001";

  const subjects = [
    {
      name: "Língua Portuguesa",
      shortName: "LP",
      code: "LP",
      type: "Nuclear",
      workload: "5h",
      mac: 14,
      npp: 13,
      pt: 15,
      mt: 14,
      exam: 13,
      finalGrade: 14,
      status: "Transita",
    },
    {
      name: "Matemática",
      shortName: "MAT",
      code: "MAT",
      type: "Nuclear",
      workload: "5h",
      mac: 12,
      npp: 11,
      pt: 13,
      mt: 12,
      exam: 12,
      finalGrade: 12,
      status: "Transita",
    },
    {
      name: "História",
      shortName: "HIST",
      code: "HIST",
      type: "Complementar",
      workload: "3h",
      mac: 15,
      npp: 14,
      pt: 16,
      mt: 15,
      exam: "—",
      finalGrade: 15,
      status: "Transita",
    },
  ];

  return {
    css: extras?.css ?? "",
    school: {
      name: school.name || "Escola SIGA",
      shortName: school.name || "Escola SIGA",
      ministry: "REPÚBLICA DE ANGOLA",
      ministryLine: "MINISTÉRIO DA EDUCAÇÃO",
      address: school.address || "Luanda, Angola",
      nif: school.nif || "5000000000",
      phone: school.phone || "+244 000 000 000",
      email: school.email || "secretaria@escola.ao",
      logoUrl: school.logoUrl || "",
      emblemUrl: "",
      flagUrl: "",
    },
    student: {
      fullName: studentName,
      academicNumber: process,
      docType: "Processo",
      docNumber: process,
      nationality: "Angolana",
      gender: "F",
    },
    classGroup: {
      name: className,
      level: programName,
      shift: "Manhã",
      room: "Sala 12",
      course: programName,
    },
    program: { name: programName },
    academicYear: { name: year },
    period: { name: "1.º Trimestre" },
    teacher: { fullName: "Prof. Manuel Costa" },
    subject: { name: "Língua Portuguesa" },
    angola: {
      gradingScale: "0–20",
      legalNote:
        "Classificações na escala de 0 a 20 valores, nos termos do perfil curricular angolano.",
    },
    grading: { minimumPass: 10 },
    document: {
      number: extras?.student?.documentTitle || "DOC-2026-0001",
      issuedAtLabel: new Date().toLocaleDateString("pt-AO"),
      issuedBy: school.directorName || "Secretaria",
      hash,
      watermarkText: "SIGA",
      qrCodeDataUrl: "",
      sourceNote: "Documento gerado no SIGA a partir do modelo escolhido pela escola.",
      uuid: hash,
      version: "1",
      legalBasis: "Emitido nos termos do regulamento interno e do perfil curricular angolano.",
    },
    application: {
      temporaryId: "CAND-2026-0142",
      status: "Submetida",
      desiredClass: programName,
      course: programName,
      submittedAt: new Date().toLocaleDateString("pt-AO"),
    },
    candidate: {
      fullName: studentName,
      docNumber: process,
    },
    guardian: {
      fullName: "Maria Ferreira",
      phone: "+244 900 000 000",
      email: "encarregado@escola.ao",
    },
    signatures: [
      { label: "O Director de Turma" },
      { label: school.directorName ? `A Direcção · ${school.directorName}` : "A Direcção" },
    ],
    subjects,
    grades: subjects.map((subject) => ({
      subject: subject.name,
      mac: subject.mac,
      npp: subject.npp,
      pt: subject.pt,
      finalGrade: subject.finalGrade,
      status: subject.status,
    })),
    students: [
      {
        index: 1,
        fullName: studentName,
        gender: "F",
        academicNumber: process,
        photoUrl: "",
        npt1: 14,
        npt2: 13,
        npt3: 15,
        cf: 14,
        exam: 13,
        recovery: "—",
        finalGrade: 14,
        status: "Transita",
        subjectGrades: [14, 12, 15],
      },
      {
        index: 2,
        fullName: "Noé Mateus",
        gender: "M",
        academicNumber: "EST-2026-0143",
        photoUrl: "",
        npt1: 11,
        npt2: 10,
        npt3: 12,
        cf: 11,
        exam: 10,
        recovery: 12,
        finalGrade: 11,
        status: "Transita",
        subjectGrades: [11, 10, 13],
      },
    ],
    summary: {
      total: 2,
      approved: 2,
      failed: 0,
      approvalRate: 100,
      average: 13,
      attendance: "96%",
      status: "Transita",
      rate: 100,
      totalLessons: 2,
      source: "Diário do professor",
      ok: 2,
      pending: 0,
    },
    record: {
      status: "Activo",
      globalAverage: 13.7,
      totalSubjects: 3,
      failedSubjects: 0,
      finalStatus: "Apto",
    },
    periods: [
      {
        name: "1.º Trimestre · 2026/2027",
        average: 14,
        status: "Transita",
        subjects,
      },
    ],
    enrollment: {
      status: "Activa",
      date: new Date().toLocaleDateString("pt-AO"),
      academicYear: { name: year },
    },
    credentials: {
      portalId: "ANA.DOMINGOS",
      institutionalEmail: "ana.domingos@escola.ao",
      compactId: "AD0142",
      institutionalId: process,
      cardId: "CART-0142",
      acceptedLoginIdentifiers: [process, "ana.domingos@escola.ao"],
      firstPasswordRule: "A primeira senha deve ser alterada no primeiro acesso.",
    },
    recovery: {
      title: "Recuperação de acesso",
      steps: ["Confirmar o número de processo", "Validar o encarregado", "Emitir nova senha temporária"],
      warning: "Não partilhar credenciais com terceiros.",
    },
    financial: { status: "Regular", total: "45.000 Kz", paid: "45.000 Kz", debt: "0 Kz" },
    nextSteps: ["Comparecer na secretaria com documentos", "Confirmar a turma atribuída"],
    restrictions: ["O talão não substitui o comprovativo de pagamento."],
    dossier: {
      checklist: [
        { item: "Bilhete de identidade", ok: true },
        { item: "Fotografia", ok: true },
        { item: "Atestado médico", ok: false },
      ],
      lifecycle: [
        {
          title: "Candidatura",
          status: "Concluída",
          completion: 100,
          nextAction: "Matricular",
        },
        {
          title: "Matrícula",
          status: "Em curso",
          completion: 60,
          nextAction: "Confirmar turma",
        },
      ],
      documents: [
        { name: "Declaração de notas", type: "Emitido" },
        { name: "Boletim 1.º T", type: "Pendente" },
      ],
    },
    service: {
      name: extras?.student?.documentTitle || "Declaração de frequência",
      areaLabel: "Secretaria",
      reference: hash,
      status: "Emitido",
      validityLabel: "90 dias",
    },
    governance: {
      riskLabel: "Baixo",
      dataSensitivityLabel: "Dados de aluno",
      retentionPolicy: "5 anos",
      approvalFlow: ["Secretaria", "Direcção"],
      automationEvents: ["Pedido registado", "Documento emitido"],
    },
    parties: [
      { label: "Aluno", value: studentName },
      { label: "Escola", value: school.name || "Escola SIGA" },
    ],
    sections: [
      {
        title: "Conteúdo",
        rows: [
          { label: "Ano lectivo", value: year, note: "" },
          { label: "Turma", value: className, note: "" },
        ],
        text: "",
      },
    ],
    rules: ["Documento válido com o código SIGA."],
    permissions: ["Secretaria", "Direcção"],
    meeting: {
      date: new Date().toLocaleDateString("pt-AO"),
      summary: "O conselho analisou o aproveitamento da turma e homologou as classificações.",
    },
    decisions: [
      {
        student: studentName,
        average: 14,
        decision: "Transita",
        observation: "Aproveitamento regular",
      },
      {
        student: "Noé Mateus",
        average: 11,
        decision: "Transita",
        observation: "Recuperação em Matemática",
      },
    ],
    lessons: [
      {
        date: "02/09/2026",
        time: "07:30–08:20",
        topic: "Leitura e interpretação",
        objectives: "Identificar a ideia principal do texto.",
        methodology: "Leitura guiada e discussão",
        assessment: "Questões orais",
        status: "Leccionada",
      },
      {
        date: "04/09/2026",
        time: "07:30–08:20",
        topic: "Gramática",
        objectives: "Aplicar a concordância verbal.",
        methodology: "Exercícios práticos",
        assessment: "Ficha formativa",
        status: "Leccionada",
      },
    ],
    validations: [
      { item: "Língua Portuguesa", status: "Conferido", note: "Sem divergências" },
      { item: "Matemática", status: "Conferido", note: "Recuperação lançada" },
    ],
    rows: [
      {
        classGroup: className,
        course: programName,
        total: 32,
        approved: 29,
        failed: 2,
        pending: 1,
        rate: 91,
      },
    ],
  };
}

export function buildIssuePayload(
  school: PrintSchoolContext,
  student: PrintStudentContext,
  css: string,
): Record<string, unknown> {
  return buildPrintSamplePayload(school, { css, student });
}
