export type AlumniSurveyQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "date" | "boolean";
  required?: boolean;
  options?: string[];
  helpText?: string;
};

/**
 * Normaliza schemas de tracer study vindos do banco.
 * O formato oficial é um array, mas aceitamos `{ questions: [...] }` e
 * `multi_select` para compatibilidade com dados/experiências antigas.
 */
export function normaliseAlumniSurveyQuestions(schema: unknown): AlumniSurveyQuestion[] {
  const source = Array.isArray(schema)
    ? schema
    : schema &&
        typeof schema === "object" &&
        Array.isArray((schema as { questions?: unknown[] }).questions)
      ? (schema as { questions: unknown[] }).questions
      : [];

  return source.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const rawType = String(row.type ?? "text");
    const type = (
      rawType === "multi_select" ? "multiselect" : rawType
    ) as AlumniSurveyQuestion["type"];
    if (!String(row.id ?? "").trim() || !String(row.label ?? "").trim()) return [];
    if (!["text", "textarea", "select", "multiselect", "number", "date", "boolean"].includes(type))
      return [];
    return [
      {
        id: String(row.id),
        label: String(row.label),
        type,
        required: Boolean(row.required),
        options: Array.isArray(row.options) ? row.options.map(String) : undefined,
        helpText: row.helpText ? String(row.helpText) : undefined,
      },
    ];
  });
}
