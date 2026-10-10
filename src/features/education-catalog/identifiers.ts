/**
 * SIGA Smart ID Engine — identificadores curtos e legíveis.
 *
 * O UUID continua a ser a chave primária; o identificador curto é o código
 * institucional que aparece em listas, documentos e QR codes. São convenções
 * internas configuráveis por escola, não códigos oficiais.
 *
 * O que já existe na base fica como está:
 *   - aluno: `students.student_number` = «EST-000123» (CHECK
 *     `^EST-[0-9]{6,}$`, gerado por `private.register_student()` com
 *     `private.student_number_sequences` e `FOR UPDATE`); o código público de
 *     7 dígitos (PayFlow, QR) deriva dele — `studentPublicCode`;
 *   - documentos: `document_sequences` + `private.next_document_number()`.
 *
 * As restantes entidades (professor, funcionário, turma, sala, curso,
 * disciplina, matrícula) são emitidas por `private.next_entity_identifier()`
 * (migração 20261010120000_global_education_catalog.sql): uma linha por
 * escola + entidade em `identifier_sequences`, incremento atómico com
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` — sem colisões em concorrência.
 *
 * Um código curto não é credencial: quem o conhece não ganha acesso a nada.
 * E não vai em URLs públicas de dados pessoais (enumeráveis); aí usa-se o
 * UUID ou um token de verificação.
 */
import { toPayflowStudentCode } from "@/features/finance/payflow-education-sync";

export type IdentifierEntity =
  | "school"
  | "student"
  | "teacher"
  | "staff"
  | "class_group"
  | "room"
  | "course"
  | "subject"
  | "enrollment"
  | "document";

export type IdentifierPolicy = {
  entity: IdentifierEntity;
  label: string;
  /** Prefixo sem hífen; vazio para só dígitos. */
  prefix: string;
  padding: number;
  /** Âmbito da unicidade. */
  scope: "platform" | "school";
  /** Onde o número é emitido na base. */
  issuer: "register_student" | "next_document_number" | "next_entity_identifier" | "provisioning";
};

export const IDENTIFIER_POLICIES: Record<IdentifierEntity, IdentifierPolicy> = {
  school: {
    entity: "school",
    label: "Escola",
    prefix: "ESC",
    padding: 3,
    scope: "platform",
    issuer: "provisioning",
  },
  student: {
    entity: "student",
    label: "Aluno",
    prefix: "EST",
    padding: 6,
    scope: "school",
    issuer: "register_student",
  },
  teacher: {
    entity: "teacher",
    label: "Professor",
    prefix: "P",
    padding: 4,
    scope: "school",
    issuer: "next_entity_identifier",
  },
  staff: {
    entity: "staff",
    label: "Funcionário",
    prefix: "F",
    padding: 4,
    scope: "school",
    issuer: "next_entity_identifier",
  },
  class_group: {
    entity: "class_group",
    label: "Turma",
    prefix: "T",
    padding: 3,
    scope: "school",
    issuer: "next_entity_identifier",
  },
  room: {
    entity: "room",
    label: "Sala",
    prefix: "S",
    padding: 3,
    scope: "school",
    issuer: "next_entity_identifier",
  },
  course: {
    entity: "course",
    label: "Curso",
    prefix: "C",
    padding: 3,
    scope: "school",
    issuer: "next_entity_identifier",
  },
  subject: {
    entity: "subject",
    label: "Disciplina",
    prefix: "D",
    padding: 3,
    scope: "school",
    issuer: "next_entity_identifier",
  },
  enrollment: {
    entity: "enrollment",
    label: "Matrícula",
    prefix: "M",
    padding: 6,
    scope: "school",
    issuer: "next_entity_identifier",
  },
  document: {
    entity: "document",
    label: "Documento",
    prefix: "DOC",
    padding: 6,
    scope: "school",
    issuer: "next_document_number",
  },
};

type Overrides = Partial<Pick<IdentifierPolicy, "prefix" | "padding">>;

/** «P-0012», «EST-000123», «DOC-000123». */
export function formatIdentifier(entity: IdentifierEntity, n: number, overrides: Overrides = {}) {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError("O número do identificador tem de ser inteiro e positivo.");
  }
  const policy = { ...IDENTIFIER_POLICIES[entity], ...overrides };
  const digits = String(n).padStart(policy.padding, "0");
  return policy.prefix ? `${policy.prefix}-${digits}` : digits;
}

/** Lê um código no formato da política; aceita minúsculas e espaços à volta. */
export function parseIdentifier(entity: IdentifierEntity, raw: string, overrides: Overrides = {}) {
  const policy = { ...IDENTIFIER_POLICIES[entity], ...overrides };
  const value = raw.trim().toUpperCase();
  const re = policy.prefix
    ? new RegExp(`^${policy.prefix}-(\\d{${policy.padding},})$`)
    : new RegExp(`^(\\d{${policy.padding},})$`);
  const m = value.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 1
    ? { n, code: formatIdentifier(entity, n, overrides) }
    : null;
}

export function isValidIdentifier(
  entity: IdentifierEntity,
  raw: string,
  overrides: Overrides = {},
) {
  return parseIdentifier(entity, raw, overrides) !== null;
}

/** Código público de 7 dígitos do aluno (QR, PayFlow): «EST-000123» → «0000123». */
export function studentPublicCode(studentNumber: string | null | undefined, studentId: string) {
  return toPayflowStudentCode(studentNumber, studentId);
}
