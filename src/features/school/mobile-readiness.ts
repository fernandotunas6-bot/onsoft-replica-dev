/**
 * Prontidão do SIGA Plus Mobile: quem já consegue usar a app e o que falta,
 * caso a caso, para os outros. Só regras puras — os dados vêm de
 * `getMobileReadiness` (mobile-readiness-server.ts), que os lê na base com as
 * mesmas regras do servidor do Mobile (`src/features/mobile-v4/`):
 *
 * - conta: `people.user_id` ligado e vínculo activo à escola com o papel certo;
 * - aluno: matrícula activa numa turma activa do ano lectivo activo, com
 *   disciplinas atribuídas;
 * - professor: disciplinas activas atribuídas numa turma activa do ano activo.
 *
 * A ligação da conta à ficha faz-se ao aceitar o convite, pelo e-mail exacto e
 * só quando há uma única ficha sem conta com esse e-mail
 * (`acceptSchoolInvitation`). Por isso o e-mail em falta ou repetido aparece à
 * parte: um convite não resolve esses casos.
 */

import { normalizeEmail as normalizeLinkEmail } from "@/features/access/person-link";

export type ReadinessEmail = "missing" | "duplicate" | "ok";

export type ReadinessPerson = {
  id: string;
  name: string;
  /** `people.user_id` (ou `teachers.user_id`) preenchido. */
  hasAccount: boolean;
  /** Vínculo activo à escola com o papel (Aluno/Professor). */
  hasRole: boolean;
  /** Ficha (aluno ou professor) e pessoa activas: o Mobile só reconhece estas. */
  recordActive: boolean;
  email: ReadinessEmail;
  invitePending: boolean;
};

export type MobileReadinessSnapshot = {
  activeYears: string[];
  students: (ReadinessPerson & { classGroupIds: string[] })[];
  teachers: (ReadinessPerson & { classSubjects: number })[];
  classGroups: {
    id: string;
    name: string;
    students: number;
    subjects: number;
    subjectsWithoutTeacher: number;
    subjectsWithoutTimetable: number;
  }[];
};

export type ReadinessLink = {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export type ReadinessCheck = {
  id: string;
  group: "Alunos" | "Professores" | "Turmas";
  title: string;
  /** O que fazer, em palavras. */
  description: string;
  count: number;
  items: { id: string; label: string; detail?: string; link: ReadinessLink }[];
  action: ReadinessLink & { label: string };
};

export type MobileReadiness = {
  activeYears: string[];
  students: { ready: number; total: number };
  teachers: { ready: number; total: number };
  checks: ReadinessCheck[];
};

/** Linhas por verificação enviadas ao ecrã; a contagem é sempre a total. */
export const READINESS_ITEM_LIMIT = 50;

const byName = <T extends { name: string; id: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, "pt") || a.id.localeCompare(b.id);

function accountChecks(
  group: "Alunos" | "Professores",
  people: ReadinessPerson[],
  profile: (id: string) => ReadinessLink,
): ReadinessCheck[] {
  const noun = group === "Alunos" ? "aluno" : "professor";
  const role = group === "Alunos" ? "Aluno" : "Professor";
  // Uma ficha inactiva aparece só na sua verificação: convidar não a resolve.
  const usable = people.filter((p) => p.recordActive);
  const without = usable.filter((p) => !p.hasAccount);
  const check = (
    id: string,
    title: string,
    description: string,
    rows: ReadinessPerson[],
    action: ReadinessCheck["action"],
    link: (p: ReadinessPerson) => ReadinessLink = (p) => profile(p.id),
  ): ReadinessCheck => ({
    id,
    group,
    title,
    description,
    count: rows.length,
    items: [...rows]
      .sort(byName)
      .slice(0, READINESS_ITEM_LIMIT)
      .map((p) => ({ id: p.id, label: p.name, link: link(p) })),
    action,
  });
  return [
    check(
      `${noun}-sem-email`,
      "Sem e-mail na ficha",
      `Sem e-mail, o convite não consegue ligar a conta à ficha do ${noun}. Acrescente o e-mail na ficha.`,
      without.filter((p) => p.email === "missing"),
      { label: "Abrir fichas", to: group === "Alunos" ? "/alunos" : "/pessoas" },
    ),
    check(
      `${noun}-email-repetido`,
      "E-mail repetido noutra ficha",
      "Duas fichas sem conta com o mesmo e-mail: o convite não sabe qual ligar. Corrija uma delas.",
      without.filter((p) => p.email === "duplicate"),
      { label: "Abrir fichas", to: group === "Alunos" ? "/alunos" : "/pessoas" },
    ),
    check(
      `${noun}-por-convidar`,
      "Por convidar",
      `Ficha pronta: convide o ${noun} em Acessos, com o papel ${role}. A conta liga-se à ficha quando aceitar.`,
      without.filter((p) => p.email === "ok" && !p.invitePending),
      { label: "Convidar em Acessos", to: "/acessos" },
    ),
    check(
      `${noun}-convite-pendente`,
      "Convite por aceitar",
      "O convite foi enviado e ainda não foi aceite. Pode reenviá-lo em Acessos.",
      without.filter((p) => p.email === "ok" && p.invitePending),
      { label: "Ver convites", to: "/acessos" },
    ),
    check(
      `${noun}-sem-papel`,
      `Conta sem o papel ${role}`,
      `A conta está ligada à ficha, mas não tem acesso activo à escola com o papel ${role}. Corrija o papel em Acessos.`,
      usable.filter((p) => p.hasAccount && !p.hasRole),
      { label: "Abrir Acessos", to: "/acessos" },
    ),
    check(
      `${noun}-ficha-inactiva`,
      "Ficha inactiva",
      `A ficha do ${noun} ou a pessoa está inactiva ou arquivada: o Mobile não a reconhece, mesmo com conta. Reactive-a na ficha, se o ${noun} continua na escola.`,
      people.filter((p) => !p.recordActive),
      { label: "Abrir fichas", to: group === "Alunos" ? "/alunos" : "/pessoas" },
    ),
  ];
}

export function buildMobileReadiness(s: MobileReadinessSnapshot): MobileReadiness {
  const groups = new Map(s.classGroups.map((g) => [g.id, g]));
  const studentHasSubjects = (ids: string[]) =>
    ids.some((id) => (groups.get(id)?.subjects ?? 0) > 0);
  const turma = (id: string, tab: string) => ({
    to: "/pedagogica",
    search: { tab, turma: id },
  });
  const classCheck = (
    id: string,
    title: string,
    description: string,
    rows: MobileReadinessSnapshot["classGroups"],
    detail: (g: MobileReadinessSnapshot["classGroups"][number]) => string,
    tab: string,
    label: string,
  ): ReadinessCheck => ({
    id,
    group: "Turmas",
    title,
    description,
    count: rows.length,
    items: [...rows]
      .sort(byName)
      .slice(0, READINESS_ITEM_LIMIT)
      .map((g) => ({ id: g.id, label: g.name, detail: detail(g), link: turma(g.id, tab) })),
    action: { label, to: "/pedagogica", search: { tab } },
  });
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return {
    activeYears: s.activeYears,
    students: {
      total: s.students.length,
      ready: s.students.filter(
        (p) => p.recordActive && p.hasAccount && p.hasRole && studentHasSubjects(p.classGroupIds),
      ).length,
    },
    teachers: {
      total: s.teachers.length,
      ready: s.teachers.filter(
        (p) => p.recordActive && p.hasAccount && p.hasRole && p.classSubjects > 0,
      ).length,
    },
    checks: [
      ...accountChecks("Alunos", s.students, (id) => ({
        to: "/alunos/$studentId",
        params: { studentId: id },
      })),
      ...accountChecks("Professores", s.teachers, (id) => ({
        to: "/professores/$teacherId",
        params: { teacherId: id },
      })),
      {
        id: "professor-sem-disciplinas",
        group: "Professores",
        title: "Sem disciplinas atribuídas",
        description:
          "O professor entra no Mobile, mas não vê turmas: atribua-lhe disciplinas na Pedagógica.",
        count: s.teachers.filter((p) => p.classSubjects === 0).length,
        items: s.teachers
          .filter((p) => p.classSubjects === 0)
          .sort(byName)
          .slice(0, READINESS_ITEM_LIMIT)
          .map((p) => ({
            id: p.id,
            label: p.name,
            link: { to: "/professores/$teacherId", params: { teacherId: p.id } },
          })),
        action: {
          label: "Atribuir disciplinas",
          to: "/pedagogica",
          search: { tab: "disciplinas" },
        },
      },
      classCheck(
        "turma-sem-disciplinas",
        "Turmas sem disciplinas",
        "Os alunos destas turmas entram no Mobile e não vêem nada: atribua as disciplinas da turma.",
        s.classGroups.filter((g) => g.students > 0 && g.subjects === 0),
        (g) => plural(g.students, "aluno matriculado", "alunos matriculados"),
        "disciplinas",
        "Atribuir disciplinas",
      ),
      classCheck(
        "turma-disciplina-sem-professor",
        "Disciplinas sem professor",
        "Sem professor, ninguém faz a chamada nem lança notas destas disciplinas no Mobile.",
        s.classGroups.filter((g) => g.subjectsWithoutTeacher > 0),
        (g) =>
          plural(g.subjectsWithoutTeacher, "disciplina sem professor", "disciplinas sem professor"),
        "disciplinas",
        "Atribuir professores",
      ),
      classCheck(
        "turma-disciplina-sem-horario",
        "Disciplinas sem horário",
        "Sem horário, o Mobile não mostra as aulas nem sugere a chamada do dia.",
        s.classGroups.filter((g) => g.subjects > 0 && g.subjectsWithoutTimetable > 0),
        (g) =>
          plural(g.subjectsWithoutTimetable, "disciplina sem horário", "disciplinas sem horário"),
        "horarios",
        "Fazer o horário",
      ),
    ],
  };
}

/** Quantas fichas sem conta usam cada e-mail (normalizado). */
export function countEmails(unlinkedEmails: (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of unlinkedEmails) {
    const email = normalizeEmail(raw);
    if (email) counts.set(email, (counts.get(email) ?? 0) + 1);
  }
  return counts;
}

/** Em falta, repetido noutra ficha sem conta (o convite não sabe qual ligar), ou bom. */
export function emailState(
  email: string | null | undefined,
  hasAccount: boolean,
  counts: Map<string, number>,
): ReadinessEmail {
  const normal = normalizeEmail(email);
  if (!normal) return "missing";
  return !hasAccount && (counts.get(normal) ?? 0) > 1 ? "duplicate" : "ok";
}

/** A mesma normalização da ligação da conta (`person-link.ts`); vazio é null. */
export const normalizeEmail = (email: string | null | undefined) =>
  normalizeLinkEmail(email) || null;
