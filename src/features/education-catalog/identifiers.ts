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
 *   - professor: `teachers.employee_number` = «DOC-000123», gerado ao criar
 *     o professor a seguir ao maior existente (`insertWithSequentialCode`);
 *
 * As restantes entidades (funcionário, turma, sala, curso, disciplina,
 * matrícula) são emitidas por `private.next_entity_identifier()`
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
  issuer:
    | "register_student"
    | "create_teacher"
    | "next_document_number"
    | "next_entity_identifier"
    | "provisioning";
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
  // O que a base já usa: «DOC-000001» (docente), gerado ao criar o professor.
  teacher: {
    entity: "teacher",
    label: "Professor",
    prefix: "DOC",
    padding: 6,
    scope: "school",
    issuer: "create_teacher",
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
    prefix: "OT",
    padding: 6,
    scope: "school",
    issuer: "next_document_number",
  },
};

type Overrides = Partial<Pick<IdentifierPolicy, "prefix" | "padding">>;

/** «DOC-000012» (professor), «EST-000123» (aluno), «OT-000123» (documento). */
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

/**
 * Próximo código «PREFIXO-000123» a seguir ao MAIOR existente com esse
 * prefixo — não à contagem de linhas. A contagem repetia números depois de
 * um registo apagado ou de um número escrito à mão, e a restrição de
 * unicidade da base fazia falhar a criação.
 */
export function nextSequentialCode(
  existing: Iterable<string | null | undefined>,
  prefix: string,
  padding: number,
) {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  let max = 0;
  for (const code of existing) {
    const m = re.exec(String(code ?? "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(padding, "0")}`;
}

/**
 * Sugestão para o próximo código de uma entidade, a continuar o padrão que a
 * escola já usa: com «S01…S07» sugere «S08»; com «LAB-2» sugere «LAB-3».
 * Usa o padrão mais frequente (prefixo, hífen, largura). Sem padrão, o da
 * política («S-001»). Só sugere: o campo continua editável e a base recusa
 * códigos repetidos.
 */
export function suggestNextCode(
  entity: IdentifierEntity,
  existing: Iterable<string | null | undefined>,
) {
  type Pattern = { prefix: string; sep: string; width: number; max: number; count: number };
  const patterns = new Map<string, Pattern>();
  const taken = new Set<string>();
  for (const raw of existing) {
    const code = String(raw ?? "")
      .trim()
      .toUpperCase();
    if (!code) continue;
    taken.add(code);
    const m = /^([A-Z]{1,6})(-?)(\d{1,8})$/.exec(code);
    if (!m) continue;
    const key = `${m[1]}|${m[2]}|${m[3]!.length}`;
    const p = patterns.get(key) ?? {
      prefix: m[1]!,
      sep: m[2]!,
      width: m[3]!.length,
      max: 0,
      count: 0,
    };
    p.max = Math.max(p.max, Number(m[3]));
    p.count += 1;
    patterns.set(key, p);
  }
  const best = [...patterns.values()].sort((a, b) => b.count - a.count || b.max - a.max)[0];
  if (best) {
    for (let n = best.max + 1; ; n += 1) {
      const code = `${best.prefix}${best.sep}${String(n).padStart(best.width, "0")}`;
      if (!taken.has(code)) return code;
    }
  }
  for (let n = 1; ; n += 1) {
    const code = formatIdentifier(entity, n);
    if (!taken.has(code)) return code;
  }
}

type InsertResult<T> = { data: T | null; error: { code?: string; message?: string } | null };

/**
 * Grava com um código sequencial e, se outro pedido gravou o mesmo número
 * entretanto (23505 na restrição indicada), tenta o seguinte. Cada tentativa
 * relê os códigos existentes.
 */
export async function insertWithSequentialCode<T>(options: {
  prefix: string;
  padding: number;
  constraint: string;
  loadExisting: () => Promise<string[]>;
  insert: (code: string) => PromiseLike<InsertResult<T>>;
  attempts?: number;
}): Promise<InsertResult<T>> {
  const attempts = options.attempts ?? 5;
  let last: InsertResult<T> = { data: null, error: { message: "Sem tentativas." } };
  for (let i = 0; i < attempts; i += 1) {
    const code = nextSequentialCode(await options.loadExisting(), options.prefix, options.padding);
    last = await options.insert(code);
    const collided =
      last.error?.code === "23505" && String(last.error.message ?? "").includes(options.constraint);
    if (!collided) return last;
  }
  return last;
}
