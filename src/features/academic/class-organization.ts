/**
 * Organizar as turmas de uma classe por idade: a turma A recebe os mais novos,
 * depois B, C… Puro (sem I/O): o servidor lê, chama isto e volta a chamar antes
 * de gravar — nunca grava o que o navegador mandou.
 *
 * Sobre o motor do #339 (`planClassAllocationByAge`), acrescenta o que a escola
 * real precisa:
 * - quem já tem notas, presenças ou entregas nesta turma FICA (mudar de turma
 *   misturava pautas); quem não tem data de nascimento válida também fica;
 * - esses lugares contam como ocupados na turma onde estão;
 * - a letra vem do código da turma («7A-M», «CFB10A-T», «DEMO1C», «10A»);
 * - a lotação legal (DP 162/23, art. 10.º: até 36, 45 com autorização regional);
 * - a ordem das mudanças, para nunca passar a lotação a meio (o gatilho recusa);
 * - uma assinatura do plano: aplicar só o que se pré-visualizou.
 */
import {
  planClassAllocationByAge,
  type ClassAllocationGroup,
  type ClassAllocationScope,
} from "./class-age-allocation";

export const LEGAL_CLASS_SIZE = 36;
export const LEGAL_CLASS_SIZE_REGIONAL = 45;

/** A letra da turma, do código («7A-M» → A) ou do nome («7ª B — Tarde» → B). */
export function classLetter(code: string, name = ""): string | null {
  const fromCode = /\d([A-Z]{1,2})(?:-[A-Z]{1,2})?$/.exec(code.trim().toUpperCase());
  if (fromCode) return fromCode[1]!;
  const fromName = /[ªº°]\s*(?:[A-Z]{2,5}\s+)?([A-Z])\b/.exec(name.trim());
  return fromName ? fromName[1]! : null;
}

function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Idade em anos completos numa data (AAAA-MM-DD). */
export function ageOn(birthDate: string | null, reference: string): number | null {
  if (!validDate(birthDate) || !validDate(reference) || birthDate > reference) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ry, rm, rd] = reference.split("-").map(Number) as [number, number, number];
  return ry - by - (rm < bm || (rm === bm && rd < bd) ? 1 : 0);
}

export type OrganizationClass = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  status: string;
};

export type OrganizationStudent = {
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  name: string;
  birthDate: string | null;
  classGroupId: string;
  /** Já tem notas, presenças, entregas ou boletins nesta matrícula. */
  hasRecords: boolean;
};

export type LineStatus = "move" | "same" | "records" | "no_birth_date" | "no_capacity";

export type OrganizationLine = {
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  name: string;
  birthDate: string | null;
  age: number | null;
  fromClassId: string;
  fromLetter: string;
  toClassId: string;
  toLetter: string;
  status: LineStatus;
};

export type OrganizationClassSummary = {
  id: string;
  letter: string;
  code: string;
  name: string;
  capacity: number;
  current: number;
  proposed: number;
  youngest: number | null;
  oldest: number | null;
};

export type OrganizationPlan = {
  classes: OrganizationClassSummary[];
  lines: OrganizationLine[];
  moves: Array<{ enrollmentId: string; studentId: string; from: string; to: string }>;
  /** Impedem aplicar (letras ilegíveis ou repetidas, sem turmas). */
  blockers: string[];
  warnings: string[];
  signature: string;
};

/** FNV-1a de 32 bits: chega para comparar dois planos, não é segredo. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildOrganizationPlan(input: {
  scope: ClassAllocationScope;
  referenceDate: string;
  classes: readonly OrganizationClass[];
  students: readonly OrganizationStudent[];
}): OrganizationPlan {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const open = input.classes.filter((group) => group.status !== "closed");
  const letterOf = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const group of open) {
    const letter = classLetter(group.code, group.name);
    if (!letter) {
      blockers.push(
        `A turma «${group.name}» (${group.code}) não tem letra reconhecível no código.`,
      );
      continue;
    }
    if (seen.has(letter)) {
      blockers.push(
        `Há duas turmas ${letter} nesta classe e turno (${seen.get(letter)} e ${group.code}).`,
      );
      continue;
    }
    seen.set(letter, group.code);
    letterOf.set(group.id, letter);
  }
  if (!open.length) blockers.push("Não há turmas abertas nesta classe e turno.");
  for (const group of open) {
    if (group.capacity > LEGAL_CLASS_SIZE_REGIONAL) {
      warnings.push(
        `A turma ${group.code} tem lotação ${group.capacity}: o DP 162/23 (art. 10.º) admite no máximo ${LEGAL_CLASS_SIZE_REGIONAL}, e só com autorização regional acima de ${LEGAL_CLASS_SIZE}.`,
      );
    } else if (group.capacity > LEGAL_CLASS_SIZE) {
      warnings.push(
        `A turma ${group.code} tem lotação ${group.capacity}: acima de ${LEGAL_CLASS_SIZE} só com autorização regional (DP 162/23, art. 10.º).`,
      );
    }
  }

  // Quem fica: tem registos nesta turma, ou não tem data de nascimento válida.
  const stays = (student: OrganizationStudent) =>
    student.hasRecords || ageOn(student.birthDate, input.referenceDate) == null;
  const reserved = new Map<string, number>();
  for (const student of input.students) {
    if (stays(student)) {
      reserved.set(student.classGroupId, (reserved.get(student.classGroupId) ?? 0) + 1);
    }
  }

  const groups: ClassAllocationGroup[] = open
    .filter((group) => letterOf.has(group.id))
    .map((group) => ({
      ...input.scope,
      id: group.id,
      letter: letterOf.get(group.id)!,
      capacity: group.capacity,
      // Mais registos do que lotação (dados antigos): a turma não recebe ninguém.
      reservedSeats: Math.min(reserved.get(group.id) ?? 0, group.capacity),
      status: group.status === "draft" ? "draft" : "active",
    }));

  const movable = input.students.filter((student) => !stays(student));
  const result = blockers.length
    ? null
    : planClassAllocationByAge({
        scope: input.scope,
        referenceDate: input.referenceDate,
        mode: "reorganize",
        students: movable.map((student) => ({
          ...input.scope,
          studentId: student.studentId,
          studentNumber: student.studentNumber,
          birthDate: student.birthDate,
          currentClassGroupId: student.classGroupId,
        })),
        groups,
      });
  const target = new Map(
    (result?.assignments ?? []).map((item) => [item.studentId, item.classGroupId]),
  );

  const lines: OrganizationLine[] = input.students.map((student) => {
    const age = ageOn(student.birthDate, input.referenceDate);
    const from = student.classGroupId;
    let to = from;
    let status: LineStatus;
    if (student.hasRecords) status = "records";
    else if (age == null) status = "no_birth_date";
    else if (!target.has(student.studentId)) status = blockers.length ? "same" : "no_capacity";
    else {
      to = target.get(student.studentId)!;
      status = to === from ? "same" : "move";
    }
    return {
      enrollmentId: student.enrollmentId,
      studentId: student.studentId,
      studentNumber: student.studentNumber,
      name: student.name,
      birthDate: student.birthDate,
      age,
      fromClassId: from,
      fromLetter: letterOf.get(from) ?? "?",
      toClassId: to,
      toLetter: letterOf.get(to) ?? "?",
      status,
    };
  });

  // Mais novo primeiro (o mesmo critério do motor), para a lista ler-se de A a Z.
  lines.sort(
    (a, b) =>
      a.toLetter.localeCompare(b.toLetter) ||
      (b.birthDate ?? "").localeCompare(a.birthDate ?? "") ||
      a.studentNumber.localeCompare(b.studentNumber, "pt", { numeric: true }),
  );

  const recordsCount = lines.filter((line) => line.status === "records").length;
  const noBirth = lines.filter((line) => line.status === "no_birth_date").length;
  const noCapacity = lines.filter((line) => line.status === "no_capacity").length;
  if (recordsCount) {
    warnings.push(
      `${recordsCount} aluno(s) já têm notas, presenças ou entregas nesta turma e ficam onde estão: mudar de turma misturava pautas. Organize antes de começarem as aulas.`,
    );
  }
  if (noBirth) {
    warnings.push(
      `${noBirth} aluno(s) sem data de nascimento válida ficam onde estão: corrija a ficha em Pessoas.`,
    );
  }
  if (noCapacity) {
    warnings.push(
      `${noCapacity} aluno(s) não cabem nas turmas desta classe: abra mais uma turma ou aumente a lotação.`,
    );
  }

  const classes: OrganizationClassSummary[] = open
    .filter((group) => letterOf.has(group.id))
    .map((group) => {
      const proposed = lines.filter((line) => line.toClassId === group.id);
      const ages = proposed.map((line) => line.age).filter((age): age is number => age != null);
      return {
        id: group.id,
        letter: letterOf.get(group.id)!,
        code: group.code,
        name: group.name,
        capacity: group.capacity,
        current: lines.filter((line) => line.fromClassId === group.id).length,
        proposed: proposed.length,
        youngest: ages.length ? Math.min(...ages) : null,
        oldest: ages.length ? Math.max(...ages) : null,
      };
    })
    .sort((a, b) => a.letter.length - b.letter.length || a.letter.localeCompare(b.letter));

  const moves = lines
    .filter((line) => line.status === "move")
    .map((line) => ({
      enrollmentId: line.enrollmentId,
      studentId: line.studentId,
      from: line.fromClassId,
      to: line.toClassId,
    }));
  const signature = fnv1a(
    moves
      .map((move) => `${move.enrollmentId}>${move.to}`)
      .sort()
      .join("|"),
  );
  return { classes, lines, moves, blockers, warnings, signature };
}

/**
 * A ordem em que se mudam os alunos sem nunca passar a lotação: primeiro quem vai
 * para uma turma com lugar livre (o que liberta lugar na de origem). Uma troca
 * entre turmas cheias não tem ordem possível: fica em `blocked`.
 */
export function orderMoves<T extends { from: string; to: string }>(
  moves: readonly T[],
  counts: ReadonlyMap<string, number>,
  capacity: ReadonlyMap<string, number>,
): { ordered: T[]; blocked: T[] } {
  const current = new Map(counts);
  const pending = [...moves];
  const ordered: T[] = [];
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i += 1) {
      const move = pending[i]!;
      if ((current.get(move.to) ?? 0) < (capacity.get(move.to) ?? 0)) {
        ordered.push(move);
        current.set(move.to, (current.get(move.to) ?? 0) + 1);
        current.set(move.from, (current.get(move.from) ?? 0) - 1);
        pending.splice(i, 1);
        i -= 1;
        progress = true;
      }
    }
  }
  return { ordered, blocked: pending };
}
