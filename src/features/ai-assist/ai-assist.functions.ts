import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ErrorDiagnosis = {
  summary: string;
  causes: Array<{ title: string; likelihood: "alta" | "média" | "baixa"; explanation: string }>;
  fixes: Array<{ title: string; steps: string[] }>;
};

export type RiskAnalysis = {
  overview: string;
  students: Array<{
    enrollment_id: string;
    name: string;
    risk: "alto" | "médio" | "baixo";
    reasons: string[];
    interventions: string[];
  }>;
};

const diagnoseSchema = z.object({
  report: z.string().trim().min(10).max(4000),
  logs: z.string().max(20000).optional().default(""),
  page: z.string().max(200).optional().default(""),
});

export const diagnoseErrorReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => diagnoseSchema.parse(input))
  .handler(async ({ data, context }): Promise<ErrorDiagnosis> => {
    const { requireSgaWriterFor } = await import("@/integrations/supabase/sga-admin");
    await requireSgaWriterFor("pedagogica", context.userId, ["Administrador"]);
    const { runAiText, parseJsonObject } = await import("@/lib/ai-gateway.server");
    const text = await runAiText(
      'És um engenheiro de suporte do SIGA Plus (sistema de gestão escolar angolano, TanStack Start + base de dados Postgres com RLS). Analisa o relatório de erro de um administrador escolar e os registos. Responde em português de Angola, linguagem simples para não programadores. Responde APENAS com JSON: {"summary": string, "causes": [{"title": string, "likelihood": "alta"|"média"|"baixa", "explanation": string}], "fixes": [{"title": string, "steps": string[]}]}. No máximo 4 causas e 4 soluções, ordenadas por probabilidade. Nunca peças palavras-passe nem chaves.',
      `Página: ${data.page || "(não indicada)"}\n\nRelatório do administrador:\n${data.report}\n\nRegistos:\n${data.logs.slice(-20000) || "(sem registos)"}`,
    );
    const parsed = parseJsonObject<ErrorDiagnosis>(text);
    if (!parsed) return { summary: text.slice(0, 2000), causes: [], fixes: [] };
    return {
      summary: String(parsed.summary ?? ""),
      causes: Array.isArray(parsed.causes) ? parsed.causes.slice(0, 4) : [],
      fixes: Array.isArray(parsed.fixes) ? parsed.fixes.slice(0, 4) : [],
    };
  });

const riskSchema = z.object({
  classGroupName: z.string().max(200),
  history: z.string().max(4000).optional().default(""),
  students: z
    .array(
      z.object({
        enrollment_id: z.string().max(64),
        name: z.string().max(200),
        grades: z.array(
          z.object({ subject: z.string().max(120), term: z.number(), average: z.number() }),
        ),
        attendance_rate: z.number().nullable().optional(),
      }),
    )
    .min(1)
    .max(80),
});

export const analyzeStudentRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => riskSchema.parse(input))
  .handler(async ({ data, context }): Promise<RiskAnalysis> => {
    const { requireSgaWriterFor } = await import("@/integrations/supabase/sga-admin");
    await requireSgaWriterFor("pedagogica", context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const { runAiText, parseJsonObject } = await import("@/lib/ai-gateway.server");
    const compact = data.students.map((s) => ({
      id: s.enrollment_id,
      nome: s.name,
      notas: s.grades.map((g) => `${g.subject} T${g.term}: ${g.average.toFixed(1)}`).join("; "),
      assiduidade: s.attendance_rate ?? null,
    }));
    const text = await runAiText(
      'És um orientador pedagógico em Angola. Escala 0–20, aprovação a partir de 10 (Decreto Executivo 424/25). Identifica alunos em risco de insucesso a partir das médias por disciplina e trimestre, tendência entre trimestres e histórico da turma. Sugere intervenções concretas e personalizadas (tutoria, contacto com encarregado, plano de recuperação, etc.). Responde em português de Angola APENAS com JSON: {"overview": string, "students": [{"enrollment_id": string, "name": string, "risk": "alto"|"médio"|"baixo", "reasons": string[], "interventions": string[]}]}. Inclui só alunos em risco alto ou médio, ordenados do maior para o menor risco, no máximo 25.',
      `Turma: ${data.classGroupName}\nHistórico e observações do professor:\n${data.history || "(nenhum)"}\n\nAlunos:\n${JSON.stringify(compact)}`,
    );
    const parsed = parseJsonObject<RiskAnalysis>(text);
    if (!parsed) return { overview: text.slice(0, 2000), students: [] };
    const known = new Set(data.students.map((s) => s.enrollment_id));
    return {
      overview: String(parsed.overview ?? ""),
      students: (Array.isArray(parsed.students) ? parsed.students : [])
        .filter((s) => known.has(String(s.enrollment_id)))
        .slice(0, 25),
    };
  });
