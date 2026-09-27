import { bankingPaymentSections, type SchoolBankingPrint } from "@/lib/finance-print";

export function overlayBoletim(input: {
  subjects: Array<{
    name: string;
    t1: string | number;
    t2?: string | number;
    t3?: string | number;
    mfa: string | number;
    status: string;
  }>;
  average?: string | number;
  attendance?: string | number;
  status?: string;
  approved?: number;
}) {
  return {
    subjects: input.subjects.map((subject) => ({
      name: subject.name,
      mac: subject.t1,
      npp: subject.t2 ?? "—",
      pt: subject.t3 ?? "—",
      mt: subject.mfa,
      exam: "—",
      finalGrade: subject.mfa,
      status: subject.status,
    })),
    grades: input.subjects.map((subject) => ({
      subject: subject.name,
      mac: subject.t1,
      npp: subject.t2 ?? "—",
      pt: subject.t3 ?? "—",
      finalGrade: subject.mfa,
      status: subject.status,
    })),
    summary: {
      average: input.average ?? "—",
      attendance: input.attendance ?? "—",
      approved:
        input.approved ??
        input.subjects.filter((row) => !/reprov|não trans/i.test(row.status)).length,
      status: input.status ?? "—",
    },
  };
}

export function overlayPauta(input: {
  subjectName?: string | undefined;
  teacherName?: string | undefined;
  periodName?: string;
  className?: string;
  courseName?: string;
  subjects?: Array<{ name: string; shortName?: string; code?: string | null }>;
  students: Array<{
    fullName: string;
    academicNumber?: string;
    gender?: string;
    mac?: string | number;
    npp?: string | number;
    npt?: string | number;
    average?: string | number;
    status: string;
    subjectGrades?: Array<string | number>;
  }>;
}) {
  const approved = input.students.filter((row) => !/reprov|não trans/i.test(row.status)).length;
  return {
    subject: { name: input.subjectName || "Disciplina" },
    teacher: { fullName: input.teacherName || "Professor" },
    ...(input.periodName ? { period: { name: input.periodName } } : {}),
    ...(input.className || input.courseName
      ? {
          classGroup: {
            name: input.className || "",
            level: input.courseName || "",
            course: input.courseName || "",
          },
        }
      : {}),
    ...(input.subjects
      ? {
          subjects: input.subjects.map((subject) => ({
            name: subject.name,
            shortName: subject.shortName || subject.code || subject.name.slice(0, 4),
            code: subject.code || subject.shortName || "",
          })),
        }
      : {}),
    students: input.students.map((student, index) => ({
      index: index + 1,
      fullName: student.fullName,
      gender: student.gender || "—",
      academicNumber: student.academicNumber || "—",
      photoUrl: "",
      npt1: student.mac ?? "—",
      npt2: student.npp ?? "—",
      npt3: student.npt ?? "—",
      cf: student.average ?? "—",
      exam: "—",
      recovery: "—",
      finalGrade: student.average ?? "—",
      average: student.average ?? "—",
      status: student.status,
      subjectGrades: student.subjectGrades ?? [
        student.mac ?? "—",
        student.npp ?? "—",
        student.npt ?? "—",
      ],
    })),
    summary: {
      total: input.students.length,
      approved,
      failed: Math.max(0, input.students.length - approved),
      approvalRate:
        input.students.length === 0 ? 0 : Math.round((approved / input.students.length) * 100),
    },
  };
}

export function overlayMapa(
  rows: Array<{
    classGroup: string;
    course: string;
    total: number;
    approved: number;
    pending?: number;
    average?: string | number;
  }>,
) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const approved = rows.reduce((sum, row) => sum + row.approved, 0);
  const pending = rows.reduce((sum, row) => sum + (row.pending ?? 0), 0);
  const failed = Math.max(0, total - approved - pending);
  return {
    rows: rows.map((row) => ({
      classGroup: row.classGroup,
      course: row.course,
      total: row.total,
      approved: row.approved,
      failed: Math.max(0, row.total - row.approved - (row.pending ?? 0)),
      pending: row.pending ?? 0,
      rate: row.total ? Math.round((row.approved / row.total) * 100) : 0,
    })),
    summary: {
      total,
      approved,
      failed,
      rate: total ? Math.round((approved / total) * 100) : 0,
    },
  };
}

type HistoricoPeriod = {
  subjects: Array<{
    name: string;
    t1: string | number;
    t2?: string | number;
    t3?: string | number;
    mfa: string | number;
    status: string;
  }>;
  periodName: string;
  average?: string | number;
  status?: string;
  /** Ano com resultado registado no histórico oficial. */
  official?: boolean;
};

/**
 * Histórico académico — aceita um período por ano lectivo (o template já suporta múltiplos via
 * `{{#each periods}}`). `record` resume o ano mais recente, como um resumo de transcript.
 */
export function overlayHistorico(input: { periods: HistoricoPeriod[] }) {
  const lastPeriod = input.periods[input.periods.length - 1];
  const failedInLast = lastPeriod
    ? lastPeriod.subjects.filter((row) => /reprov|não trans/i.test(row.status)).length
    : 0;

  return {
    periods: input.periods.map((period) => ({
      name: period.periodName,
      average: period.average ?? "—",
      status: period.status ?? "—",
      subjects: period.subjects.map((subject) => ({
        name: subject.name,
        type: "",
        workload: "—",
        mac: subject.t1,
        npp: subject.t2 ?? "—",
        pt: subject.t3 ?? "—",
        mt: subject.mfa,
        exam: "—",
        finalGrade: subject.mfa,
        status: subject.status,
      })),
    })),
    record: {
      status: "Activo",
      globalAverage: lastPeriod?.average ?? "—",
      totalSubjects: lastPeriod?.subjects.length ?? 0,
      failedSubjects: failedInLast,
      finalStatus: lastPeriod?.status ?? "—",
    },
  };
}

export function overlayTalao(input: {
  kind: "candidatura" | "matricula";
  fullName: string;
  process?: string;
  className?: string;
  course?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  submittedAt?: string;
}) {
  return {
    application: {
      temporaryId: input.process || "CAND",
      status: input.kind === "matricula" ? "Matriculado" : "Submetida",
      desiredClass: input.className || input.course || "—",
      course: input.course || input.className || "—",
      submittedAt: input.submittedAt || new Date().toLocaleDateString("pt-AO"),
    },
    candidate: {
      fullName: input.fullName,
      docNumber: input.process || "—",
    },
    guardian: {
      fullName: input.guardianName || "—",
      phone: input.guardianPhone || "—",
      email: input.guardianEmail || "—",
    },
    enrollment: {
      status: input.kind === "matricula" ? "Activa" : "Candidatura",
      date: input.submittedAt || new Date().toLocaleDateString("pt-AO"),
    },
    classGroup: {
      name: input.className || "A atribuir",
      course: input.course || "—",
      level: input.course || input.className || "—",
    },
    nextSteps:
      input.kind === "matricula"
        ? ["Comparecer na secretaria com documentos", "Levantar credenciais do portal"]
        : ["Aguardar confirmação da secretaria", "Comparecer com documentos originais"],
  };
}

export function overlayDiario(input: {
  teacherName: string;
  subjectName?: string;
  className?: string;
  lessons: Array<{
    date: string;
    time: string;
    topic: string;
    objectives?: string;
    methodology?: string;
    assessment?: string;
    status?: string;
  }>;
}) {
  return {
    teacher: { fullName: input.teacherName },
    subject: { name: input.subjectName || "Disciplinas atribuídas" },
    classGroup: { name: input.className || "Várias turmas", level: input.className || "—" },
    lessons: input.lessons.map((lesson) => ({
      date: lesson.date,
      time: lesson.time,
      topic: lesson.topic,
      objectives: lesson.objectives || "Cumprir o plano curricular da disciplina.",
      methodology: lesson.methodology || "Aula presencial",
      assessment: lesson.assessment || "Observação contínua",
      status: lesson.status || "Planeada",
    })),
    summary: {
      totalLessons: input.lessons.length,
      source: "Horário do professor",
    },
  };
}

export function overlayActa(input: {
  teacherName?: string | undefined;
  summary?: string | undefined;
  decisions: Array<{
    student: string;
    average: string | number;
    decision: string;
    observation?: string;
  }>;
}) {
  const approved = input.decisions.filter((row) => !/reprov|não trans/i.test(row.decision)).length;
  return {
    teacher: { fullName: input.teacherName || "Director de turma" },
    meeting: {
      date: new Date().toLocaleDateString("pt-AO"),
      summary:
        input.summary ||
        "O conselho analisou o aproveitamento da turma e homologou as classificações do período.",
    },
    decisions: input.decisions,
    summary: {
      total: input.decisions.length,
      approved,
      failed: Math.max(0, input.decisions.length - approved),
      approvalRate: input.decisions.length
        ? Math.round((approved / input.decisions.length) * 100)
        : 0,
    },
  };
}

export function overlayValidacao(items: Array<{ item: string; status: string; note?: string }>) {
  const ok = items.filter((row) => !/reprov|não trans|pendente/i.test(row.status)).length;
  return {
    validations: items.map((row) => ({
      item: row.item,
      status: row.status,
      note: row.note || "",
    })),
    summary: {
      total: items.length,
      ok,
      pending: Math.max(0, items.length - ok),
    },
  };
}

export function overlayDossie(input: {
  status: string;
  enrollmentStatus: string;
  checklist: Array<{ item: string; ok: boolean }>;
  subjects: Array<{ name: string; status: string }>;
  documents: Array<{ name: string; type: string }>;
}) {
  const done = input.checklist.filter((row) => row.ok).length;
  return {
    student: { status: input.status },
    enrollment: { status: input.enrollmentStatus },
    dossier: {
      checklist: input.checklist,
      lifecycle: [
        {
          title: "Matrícula",
          status: /activ/i.test(input.enrollmentStatus) ? "Concluída" : "Pendente",
          completion: /activ/i.test(input.enrollmentStatus) ? 100 : 40,
          nextAction: /activ/i.test(input.enrollmentStatus) ? "Acompanhar notas" : "Atribuir turma",
        },
        {
          title: "Documentação",
          status: done === input.checklist.length ? "Concluída" : "Em curso",
          completion: input.checklist.length
            ? Math.round((done / input.checklist.length) * 100)
            : 0,
          nextAction: done === input.checklist.length ? "Arquivar" : "Completar checklist",
        },
      ],
      documents: input.documents,
    },
    subjects: input.subjects,
  };
}

export function overlayCredenciais(input: {
  fullName: string;
  process: string;
  email?: string | null;
  schoolEmailDomain?: string;
}) {
  const slug = input.process
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const domain = input.schoolEmailDomain || "escola.ao";
  const institutionalEmail = input.email || `${slug || "aluno"}@${domain}`;
  return {
    credentials: {
      portalId: slug.toUpperCase() || input.process,
      institutionalEmail,
      compactId: input.process.slice(-6),
      institutionalId: input.process,
      cardId: `CART-${input.process.slice(-6)}`,
      acceptedLoginIdentifiers: [input.process, institutionalEmail].filter(Boolean),
      firstPasswordRule: "A primeira senha deve ser alterada no primeiro acesso ao portal.",
    },
  };
}

export function overlayServico(input: {
  name: string;
  areaLabel?: string;
  reference: string;
  status: string;
  validityLabel?: string;
  parties: Array<{ label: string; value: string }>;
  sections: Array<{
    title: string;
    rows?: Array<{ label: string; value: string; note?: string }>;
    text?: string;
  }>;
  banking?: SchoolBankingPrint | null;
  rules?: string[];
  permissions?: string[];
  term?: string;
}) {
  const area = input.areaLabel || "Tesouraria";
  const finance =
    /tesour|financ|caixa|fatura|recibo|cobran/i.test(area) ||
    /fatura|recibo|caixa|pagamento|tesour/i.test(input.name);
  const baseSections = input.sections.map((section) => ({
    title: section.title,
    rows: section.rows,
    text: section.text || "",
  }));
  const paymentSections = finance ? bankingPaymentSections(input.banking) : [];
  return {
    service: {
      name: input.name,
      areaLabel: area,
      reference: input.reference,
      status: input.status,
      validityLabel:
        input.validityLabel || (finance ? "Documento de tesouraria" : "Documento institucional"),
    },
    parties: input.parties,
    sections: [
      ...baseSections,
      ...paymentSections.map((section) => ({
        title: section.title,
        rows: section.rows,
        text: "",
      })),
    ],
    rules: input.rules ?? [
      "Documento válido com o código de verificação SIGA.",
      ...(finance ? ["A tesouraria pode exigir o original para efeitos de quitação."] : []),
    ],
    permissions: input.permissions ?? [finance ? "Tesouraria" : "Secretaria", "Direcção"],
    responsibilityTerm:
      input.term ||
      (finance
        ? "A escola confirma os valores aqui descritos com base nos lançamentos do caixa SIGA."
        : "A escola confirma os dados aqui descritos com base nos registos do SIGA."),
    governance: {
      riskLabel: finance ? "Financeiro" : "Institucional",
      dataSensitivityLabel: finance ? "Dados de tesouraria" : "Dados escolares",
      retentionPolicy: finance ? "10 anos" : "5 anos",
      approvalFlow: [finance ? "Tesouraria" : "Secretaria", "Direcção"],
      automationEvents: finance
        ? ["Documento emitido", "Lançamento no caixa"]
        : ["Documento emitido"],
    },
  };
}

export function overlayCertificadoHabilitacoes(input: {
  fullName: string;
  biNumber: string;
  birthDate?: string;
  birthPlace?: string;
  courseName: string;
  cycleName: string;
  academicYear: string;
  subjects: Array<{
    name: string;
    finalGrade: number;
    qualitative?: string;
  }>;
  finalAverage: number;
  certificateNumber: string;
}) {
  const approved = input.finalAverage >= 10;
  return {
    certificate: {
      number: input.certificateNumber,
      cycle: input.cycleName,
      course: input.courseName,
      academicYear: input.academicYear,
      issueDate: new Date().toLocaleDateString("pt-AO"),
    },
    student: {
      fullName: input.fullName,
      biNumber: input.biNumber,
      birthDate: input.birthDate || "—",
      birthPlace: input.birthPlace || "Luanda",
    },
    subjects: input.subjects.map((sub) => ({
      name: sub.name,
      finalGrade: sub.finalGrade,
      qualitative:
        sub.qualitative ||
        (sub.finalGrade >= 18
          ? "Excelente"
          : sub.finalGrade >= 16
            ? "Muito Bom"
            : sub.finalGrade >= 14
              ? "Bom"
              : sub.finalGrade >= 10
                ? "Suficiente"
                : "Insuficiente"),
    })),
    summary: {
      finalAverage: input.finalAverage.toFixed(1),
      status: approved ? "Aprovado(a) com Aproveitamento" : "Não Aprovado(a)",
      legalBasis: "Nos termos do Decreto Executivo n.º 14/21 do MINED Angola",
    },
  };
}

export function overlayDeclaracaoComNotas(input: {
  fullName: string;
  processNumber: string;
  className: string;
  courseName?: string;
  academicYear: string;
  purpose?: string;
  subjects: Array<{
    name: string;
    mac?: number | string;
    npp?: number | string;
    npt?: number | string;
    average?: number | string;
    status?: string;
  }>;
  overallAverage?: number | string;
}) {
  return {
    declaration: {
      processNumber: input.processNumber,
      className: input.className,
      courseName: input.courseName || input.className,
      academicYear: input.academicYear,
      purpose: input.purpose || "para os efeitos que julgar convenientes",
      issueDate: new Date().toLocaleDateString("pt-AO"),
    },
    student: {
      fullName: input.fullName,
      registrationNumber: input.processNumber,
    },
    subjects: input.subjects.map((sub) => ({
      name: sub.name,
      mac: sub.mac ?? "—",
      npp: sub.npp ?? "—",
      npt: sub.npt ?? "—",
      average: sub.average ?? "—",
      status: sub.status ?? (Number(sub.average) >= 10 ? "Transita" : "Pendente"),
    })),
    summary: {
      overallAverage: input.overallAverage ?? "—",
      issueLocation: "Secretaria Geral da Escola",
    },
  };
}

export function overlayCredencialExame(input: {
  fullName: string;
  registrationNumber: string;
  className: string;
  courseName?: string;
  academicYear: string;
  examSession: string;
  authorizedDisciplines: string[];
  seatNumber?: string;
  roomNumber?: string;
}) {
  return {
    credential: {
      code: `EXAM-${input.registrationNumber.slice(-6)}-2026`,
      session: input.examSession,
      academicYear: input.academicYear,
      seatNumber: input.seatNumber || "S-01",
      roomNumber: input.roomNumber || "Sala 01",
      issueDate: new Date().toLocaleDateString("pt-AO"),
    },
    student: {
      fullName: input.fullName,
      registrationNumber: input.registrationNumber,
      className: input.className,
      courseName: input.courseName || input.className,
    },
    authorizedDisciplines: input.authorizedDisciplines.map((name) => ({
      name,
      status: "Autorizado para Prova",
    })),
    instructions: [
      "Apresentar obrigatoriamente junto do Bilhete de Identidade original.",
      "Entrada permitida até 15 minutos antes do início do exame.",
      "Proibida a entrada com telemóveis ou dispositivos eletrónicos não autorizados.",
    ],
  };
}
