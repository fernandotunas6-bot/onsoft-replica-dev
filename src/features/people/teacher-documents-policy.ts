/**
 * Catálogo configurável para o processo individual de docentes em Angola.
 * A proposta inicial não afirma que todos os itens são universalmente exigidos.
 * Fonte e enquadramento: Decreto Presidencial 37/23, Estatuto 160/18,
 * documentos dos concursos públicos 2026 e regime especial de ensino superior.
 */
export const TEACHER_DOCUMENTS = [
  { code: "bi", label: "Bilhete de Identidade", group: "Identificação", category: "bilhete", suggested: true, note: "Identificação actualizada." },
  { code: "habilitacoes", label: "Certificado de habilitações académicas", group: "Habilitações", category: "certificado", suggested: true, note: "Habilitações compatíveis com as disciplinas atribuídas." },
  { code: "docencia", label: "Diploma / habilitação para docência", group: "Habilitações", category: "certificado", suggested: true, note: "Aplicável segundo o estatuto e o nível de ensino." },
  { code: "cv", label: "Curriculum vitae", group: "Habilitações", category: "outro", suggested: false, note: "Recomendado no recrutamento e processos de direcção." },
  { code: "contrato", label: "Contrato de trabalho assinado", group: "Contrato e pagamentos", category: "contrato", suggested: false, note: "Após contratação; o RH guarda o original." },
  { code: "nif", label: "Comprovativo do NIF", group: "Contrato e pagamentos", category: "outro", suggested: false, note: "Necessário conforme regime fiscal de contratação." },
  { code: "iban", label: "Comprovativo de IBAN", group: "Contrato e pagamentos", category: "outro", suggested: false, note: "Necessário para pagamento bancário." },
  { code: "foto", label: "Fotografia tipo passe", group: "Identificação", category: "foto", suggested: false, note: "Quantidade definida pela escola ou concurso." },
  { code: "registo_criminal", label: "Certificado de registo criminal", group: "Verificação", category: "outro", suggested: false, note: "Exigir apenas no regime legal aplicável." },
  { code: "atestado_medico", label: "Atestado médico", group: "Verificação", category: "outro", suggested: false, note: "Documento sensível: acesso reservado, sem diagnósticos na ficha." },
  { code: "vacinas", label: "Certificado de vacinas", group: "Verificação", category: "outro", suggested: false, note: "Condicional; não exigir indiscriminadamente." },
  { code: "situacao_militar", label: "Comprovativo da situação militar", group: "Verificação", category: "outro", suggested: false, note: "Somente quando legalmente aplicável." },
  { code: "inaarees", label: "Reconhecimento INAAREES", group: "Habilitações", category: "certificado", suggested: false, note: "Quando o diploma estrangeiro o exige." },
  { code: "formacao_pedagogica", label: "Formação pedagógica / agregação", group: "Habilitações", category: "certificado", suggested: false, note: "Conforme função e carreira." },
  { code: "experiencia", label: "Declarações de experiência docente", group: "Habilitações", category: "outro", suggested: false, note: "Conforme vaga ou progressão." },
  { code: "autorizacao_acumulacao", label: "Autorização de acumulação de funções", group: "Contrato e pagamentos", category: "outro", suggested: false, note: "Apenas se houver acumulação sujeita a autorização." },
  { code: "pos_graduacao", label: "Diploma de pós-graduação / mestrado / doutoramento", group: "Ensino Superior", category: "certificado", suggested: false, note: "Conforme categoria docente e requisitos do posto." },
  { code: "prova_pedagogica", label: "Prova de aptidão pedagógica e científica", group: "Ensino Superior", category: "outro", suggested: false, note: "Conforme procedimento de ingresso." },
] as const;
export type TeacherDocumentCode = (typeof TEACHER_DOCUMENTS)[number]["code"];
export const teacherDocumentCodes = TEACHER_DOCUMENTS.map((item) => item.code);
export const TEACHER_DOCUMENT_LEVELS = [
  { id: "pre_escolar", label: "Pré-escolar" },
  { id: "primario", label: "Primário" },
  { id: "i_ciclo", label: "I Ciclo" },
  { id: "ii_ciclo", label: "II Ciclo / Médio" },
  { id: "superior", label: "Ensino Superior" },
] as const;
export type TeacherDocumentLevel = (typeof TEACHER_DOCUMENT_LEVELS)[number]["id"];
export type TeacherDocumentPolicy = {
  enabled: boolean;
  required: TeacherDocumentCode[];
  /** Requisitos adicionais por nível efectivo do docente. */
  requiredByLevel: Partial<Record<TeacherDocumentLevel, TeacherDocumentCode[]>>;
  collection: "apos_criacao";
};

export function parseTeacherDocumentPolicy(raw: unknown): TeacherDocumentPolicy {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  const codes = Array.isArray(value.required) ? value.required : undefined;
  const required = codes
    ? teacherDocumentCodes.filter((code) => codes.includes(code))
    : TEACHER_DOCUMENTS.filter((item) => item.suggested).map((item) => item.code);
  const inputLevels = value.requiredByLevel && typeof value.requiredByLevel === "object" &&
    !Array.isArray(value.requiredByLevel)
    ? value.requiredByLevel as Record<string, unknown> : {};
  const requiredByLevel: TeacherDocumentPolicy["requiredByLevel"] = {};
  for (const { id } of TEACHER_DOCUMENT_LEVELS) {
    const configured = inputLevels[id];
    if (Array.isArray(configured)) {
      requiredByLevel[id] = teacherDocumentCodes.filter((code) => configured.includes(code));
    }
  }
  return { enabled: value.enabled === true, required, requiredByLevel, collection: "apos_criacao" };
}

export function requiredTeacherDocuments(
  policy: TeacherDocumentPolicy, levels: readonly string[] = [],
): TeacherDocumentCode[] {
  if (!policy.enabled) return [];
  const combined = new Set<TeacherDocumentCode>(policy.required);
  for (const level of levels) {
    if (level in policy.requiredByLevel) {
      for (const code of policy.requiredByLevel[level as TeacherDocumentLevel] ?? []) combined.add(code);
    }
  }
  return teacherDocumentCodes.filter((code) => combined.has(code));
}

/**
 * Sufixo único por ficheiro; não substitui o número oficial do documento.
 * A tag é metadado reservado da Secretaria; só uma operação autenticada
 * do servidor a pode criar depois de validar school/person/privacidade.
 */
export function teacherDocumentFileCode(code: TeacherDocumentCode, fileId: string): string {
  return `TCHR-${code.toUpperCase()}-${fileId.replace(/-/g, "").toUpperCase()}`;
}
export function teacherDocumentCodeFromFile(reference: string | null | undefined): TeacherDocumentCode | null {
  const normalized = (reference ?? "").trim().toUpperCase();
  return teacherDocumentCodes.find((code) => normalized.startsWith(`TCHR-${code.toUpperCase()}-`)) ?? null;
}

export function teacherDocumentChecklist(
  policy: TeacherDocumentPolicy,
  fileReferences: readonly (string | null)[],
  levels: readonly string[] = [],
) {
  const delivered = new Set(
    fileReferences.map((reference) => teacherDocumentCodeFromFile(reference)).filter(Boolean),
  );
  const required = requiredTeacherDocuments(policy, levels);
  return TEACHER_DOCUMENTS.map((doc) => ({
    ...doc,
    required: required.includes(doc.code),
    received: delivered.has(doc.code),
    /** Recebido não significa autenticidade verificada. */
    status: delivered.has(doc.code) ? "recebido" as const : "em_falta" as const,
  }));
}
