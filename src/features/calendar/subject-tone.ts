/**
 * Cor por disciplina no horário: uma matiz oklch por disciplina, com a luminosidade
 * fixada em `.subject-tone` (styles.css) para o contraste ser igual em todas.
 *
 * A matiz preferida sai do nome, por isso «Matemática» tem a mesma cor em qualquer
 * turma. Dentro do mesmo horário, a disciplina que caia numa matiz já usada salta 4
 * posições (~160°), pela ordem alfabética, para não ficar com uma cor vizinha.
 */
export const SUBJECT_HUES = [255, 205, 165, 135, 80, 45, 15, 340, 300] as const;
const COLLISION_STRIDE = 4;

function normalize(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

function preferredIndex(name: string) {
  let hash = 0;
  for (const char of normalize(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % SUBJECT_HUES.length;
}

export function subjectHues(names: Iterable<string>): Map<string, number> {
  const distinct = [...new Set(names)].sort((a, b) => a.localeCompare(b, "pt"));
  const taken = new Set<number>();
  const hues = new Map<string, number>();
  for (const name of distinct) {
    let index = preferredIndex(name);
    // 4 e 9 são primos entre si: o salto percorre todas. Com mais disciplinas do que
    // matizes, volta a repetir a preferida.
    for (let step = 0; step < SUBJECT_HUES.length && taken.has(index); step += 1) {
      index = (index + COLLISION_STRIDE) % SUBJECT_HUES.length;
    }
    taken.add(index);
    hues.set(name, SUBJECT_HUES[index]!);
  }
  return hues;
}
