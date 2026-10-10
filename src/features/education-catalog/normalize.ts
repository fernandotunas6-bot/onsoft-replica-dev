/**
 * Normalização de nomes escritos à mão — classes, períodos e disciplinas —
 * para o registo canónico do catálogo. Serve a importação, os documentos e
 * a verificação de duplicados: «Matemática», «Matematica» e «MAT» são a mesma
 * disciplina; «10.ª Classe», «10a classe» e «décima classe» a mesma classe.
 *
 * Não adivinha: o que não reconhece devolve `null`, para quem chama decidir
 * (perguntar, ou deixar como está). Os sinónimos servem a pesquisa; a
 * equivalência só vale quando o texto bate exactamente com um nome,
 * sinónimo ou código conhecido, ou difere numa só letra.
 */
import { GLOBAL_COURSES } from "./data/courses";
import { GLOBAL_SUBJECTS, type GlobalSubject } from "./data/subjects";
import { editDistance, normalizeText } from "./search";

const ORDINAL_WORDS: Record<string, number> = {
  primeira: 1,
  primeiro: 1,
  segunda: 2,
  segundo: 2,
  terceira: 3,
  terceiro: 3,
  quarta: 4,
  quarto: 4,
  quinta: 5,
  quinto: 5,
  sexta: 6,
  sexto: 6,
  setima: 7,
  setimo: 7,
  oitava: 8,
  oitavo: 8,
  nona: 9,
  nono: 9,
  decima: 10,
  decimo: 10,
  "decima primeira": 11,
  "decimo primeiro": 11,
  "decima segunda": 12,
  "decimo segundo": 12,
  "decima terceira": 13,
  "decimo terceiro": 13,
};

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

export type NormalizedGrade = { n: number; unit: "classe" | "ano"; label: string };

/** «10.ª Classe», «10a classe», «décima classe», «7.º ano», «1º Ano», «Iniciação». */
export function normalizeGrade(raw: string): NormalizedGrade | null {
  const text = normalizeText(raw.replace(/[ªº°]/g, " "));
  if (!text) return null;
  if (/^(classe de )?iniciacao$/.test(text)) return { n: 0, unit: "classe", label: "Iniciação" };
  const unit: NormalizedGrade["unit"] | null = /\bclasse\b/.test(text)
    ? "classe"
    : /\bano\b/.test(text)
      ? "ano"
      : null;
  let n: number | null = null;
  const digits = text.match(/^(\d{1,2})\s*(?:a|o)?\b/);
  if (digits) n = Number(digits[1]);
  if (n == null) {
    const words = text.replace(/\b(classe|ano)\b/g, "").trim();
    n = ORDINAL_WORDS[words] ?? null;
  }
  if (n == null || n < 1 || n > 13) return null;
  const u = unit ?? "classe";
  return { n, unit: u, label: u === "classe" ? `${n}ª Classe` : `${n}º Ano` };
}

export type PeriodKind = "trimestre" | "periodo" | "semestre";
export type NormalizedPeriod = { n: number; kind: PeriodKind; label: string };

const PERIOD_LABEL: Record<PeriodKind, string> = {
  trimestre: "Trimestre",
  periodo: "Período",
  semestre: "Semestre",
};
const PERIOD_MAX: Record<PeriodKind, number> = { trimestre: 3, periodo: 3, semestre: 2 };

/** «1º Trimestre», «I Trimestre», «1.º período», «2º semestre», «T1», «S2», «2T». */
export function normalizePeriod(raw: string): NormalizedPeriod | null {
  const text = normalizeText(raw.replace(/[ªº°]/g, " "));
  if (!text) return null;
  let kind: PeriodKind | null = null;
  if (/trim/.test(text)) kind = "trimestre";
  else if (/period/.test(text)) kind = "periodo";
  else if (/sem/.test(text)) kind = "semestre";
  let n: number | null = null;
  const short = text.replace(/ /g, "").match(/^([ts])(\d)$|^(\d)([ts])$/);
  if (short) {
    const letter = short[1] ?? short[4];
    n = Number(short[2] ?? short[3]);
    kind = letter === "t" ? "trimestre" : "semestre";
  }
  if (!kind) return null;
  if (n == null) {
    const d = text.match(/\b(\d)\b/);
    const r = text.match(/\b(i{1,3}|iv|v|vi)\b/);
    const w = text.split(" ").find((t) => ORDINAL_WORDS[t] != null);
    n = d ? Number(d[1]) : r ? ROMAN[r[1]!]! : w ? ORDINAL_WORDS[w]! : null;
  }
  if (n == null || n < 1 || n > PERIOD_MAX[kind]) return null;
  return { n, kind, label: `${n}º ${PERIOD_LABEL[kind]}` };
}

type SubjectIndex = Map<string, GlobalSubject>;
let index: SubjectIndex | null = null;

function subjectIndex(): SubjectIndex {
  if (index) return index;
  index = new Map();
  for (const s of GLOBAL_SUBJECTS) {
    for (const key of [
      s.code,
      s.name,
      s.short,
      ...s.aliases,
      ...Object.values(s.localNames ?? {}),
    ]) {
      const k = normalizeText(key ?? "");
      // Primeiro a chegar fica: o código ou nome canónico de uma disciplina
      // ganha ao sinónimo de outra (ex.: «LE» é sinónimo de Inglês).
      if (k && !index.has(k)) index.set(k, s);
    }
  }
  return index;
}

export type SubjectResolution = { subject: GlobalSubject; via: "exact" | "typo" };

/** «Matematica», «MAT», «L. Portuguesa», «Ingles» → disciplina do catálogo. */
export function resolveSubject(raw: string): SubjectResolution | null {
  const k = normalizeText(raw);
  if (!k) return null;
  const idx = subjectIndex();
  const exact = idx.get(k);
  if (exact) return { subject: exact, via: "exact" };
  if (k.length < 5) return null;
  let best: { s: GlobalSubject; d: number } | null = null;
  let tie = false;
  for (const [key, s] of idx) {
    if (key.length < 5) continue;
    const d = editDistance(k, key, 1);
    if (d > 1) continue;
    if (!best || d < best.d) {
      best = { s, d };
      tie = false;
    } else if (d === best.d && best.s.code !== s.code) tie = true;
  }
  return best && !tie ? { subject: best.s, via: "typo" } : null;
}

/**
 * Agrupa nomes de disciplinas de uma escola que são a mesma disciplina do
 * catálogo. Devolve só os grupos com mais de um nome (os duplicados).
 */
export function findSubjectDuplicates(names: readonly string[]) {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const r = resolveSubject(name);
    if (!r) continue;
    const list = groups.get(r.subject.code) ?? [];
    list.push(name);
    groups.set(r.subject.code, list);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([code, list]) => ({ code, names: list }));
}

/**
 * Código do catálogo para um NOME escrito pela escola ou numa folha, só por
 * correspondência exacta (nome, nome local ou sinónimo). Siglas soltas («EM»,
 * «MAT») não contam: numa escola «EM» é Estudo do Meio, noutra Educação Moral.
 * Para juntar coisas que já são da escola sem adivinhar.
 */
export function subjectCatalogKey(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text || /^[A-ZÀ-Ý0-9.]{1,6}$/.test(text)) return null;
  const match = resolveSubject(text);
  return match?.via === "exact" ? match.subject.code : null;
}

let courseIndex: Map<string, string | null> | null = null;

/**
 * Código do catálogo para o NOME de um curso («Ciências Económico-Jurídicas» →
 * SEC-CEJ), só por nome ou sinónimo exactos. Siglas soltas («CEJ», «INF») não
 * contam, e um sinónimo que serve dois cursos não aponta para nenhum.
 */
export function courseCatalogKey(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text || /^[A-ZÀ-Ý0-9.]{1,6}$/.test(text)) return null;
  if (!courseIndex) {
    courseIndex = new Map();
    for (const c of GLOBAL_COURSES) {
      for (const key of [c.name, ...c.aliases]) {
        if (/^[A-ZÀ-Ý0-9.]{1,6}$/.test(key)) continue;
        const k = normalizeText(key);
        if (!k) continue;
        const seen = courseIndex.get(k);
        courseIndex.set(k, seen === undefined || seen === c.code ? c.code : null);
      }
    }
  }
  return courseIndex.get(normalizeText(text)) ?? null;
}
