import { describe, expect, it } from "vitest";
import { SUBJECT_HUES, subjectHues } from "@/features/calendar/subject-tone";

const turma = [
  "Matemática",
  "Língua Portuguesa",
  "Física",
  "Química",
  "Biologia",
  "Inglês",
  "Filosofia",
  "Educação Física",
  "Empreendedorismo",
];

describe("cor por disciplina", () => {
  it("dá cores diferentes a todas as disciplinas de uma turma enquanto houver matizes", () => {
    const hues = subjectHues(turma);
    expect(new Set(hues.values()).size).toBe(turma.length);
    for (const hue of hues.values()) expect(SUBJECT_HUES).toContain(hue);
  });

  it("não depende da ordem nem das repetições das aulas", () => {
    const shuffled = [...turma].reverse().flatMap((name) => [name, name]);
    expect(subjectHues(shuffled)).toEqual(subjectHues(turma));
  });

  it("uma disciplina sozinha fica sempre com a sua matiz, ignorando acentos e espaços", () => {
    expect(subjectHues(["Matemática"]).get("Matemática")).toBe(
      subjectHues([" matematica "]).get(" matematica "),
    );
  });

  it("com mais disciplinas do que matizes, repete em vez de falhar", () => {
    const many = Array.from({ length: SUBJECT_HUES.length + 3 }, (_, i) => `Disciplina ${i}`);
    expect(subjectHues(many).size).toBe(many.length);
  });
});
