import { describe, expect, it } from "vitest";
import { normaliseAlumniSurveyQuestions } from "@/features/alumni/survey-schema";

describe("alumni tracer study schema normalization", () => {
  it("accepts the official array schema", () => {
    const questions = normaliseAlumniSurveyQuestions([
      {
        id: "employment",
        label: "Situação profissional",
        type: "select",
        required: true,
        options: ["Empregado", "À procura"],
      },
      {
        id: "skills",
        label: "Competências",
        type: "multiselect",
        options: ["Liderança", "Tecnologia"],
      },
    ]);
    expect(questions).toHaveLength(2);
    expect(questions[1]?.type).toBe("multiselect");
  });

  it("supports legacy wrapper and multi_select alias", () => {
    const questions = normaliseAlumniSurveyQuestions({
      questions: [
        { id: "skills", label: "Competências", type: "multi_select", options: ["A", "B"] },
      ],
    });
    expect(questions).toHaveLength(1);
    expect(questions[0]?.type).toBe("multiselect");
  });

  it("ignores malformed or unsupported questions", () => {
    const questions = normaliseAlumniSurveyQuestions([
      { id: "", label: "Sem id", type: "text" },
      { id: "bad", label: "Inválida", type: "file" },
      null,
      { id: "ok", label: "Válida", type: "boolean" },
    ]);
    expect(questions).toEqual([
      {
        id: "ok",
        label: "Válida",
        type: "boolean",
        required: false,
        options: undefined,
        helpText: undefined,
      },
    ]);
  });
});
