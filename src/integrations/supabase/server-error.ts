import { sqlApplyHint } from "@/lib/sql-doc-hint";

type DatabaseError = {
  code?: string | undefined;
  message?: string | undefined;
};

const publicMessages: Record<string, string> = {
  "23503": "O registo depende de dados que não existem ou já foram removidos.",
  "23505": "Já existe um registo com estes dados.",
  "23514": "Um ou mais valores não respeitam as regras do sistema.",
  "42501": "Não tem permissão para realizar esta operação.",
  "42P01": `Tabela em falta no SGA. ${sqlApplyHint("premium")}`,
  PGRST116: "O registo solicitado não foi encontrado.",
};

/** Prevent database structure and raw SQL details from reaching browser clients. */
export function publicDatabaseError(error: DatabaseError, fallback: string): Error {
  // A mensagem devolvida ao browser é deliberadamente vaga; sem este registo
  // no servidor um 23502/23503 fica invisível para quem depura.
  if (typeof window === "undefined") {
    console.error("[db] %s %s", error.code ?? "(sem código)", error.message ?? fallback);
  }
  const missingTable =
    error.code === "42P01" ||
    /schema cache|does not exist|relation .* does not exist/i.test(String(error.message ?? ""));
  if (missingTable) {
    return new Error(publicMessages["42P01"] ?? fallback);
  }
  return new Error((error.code && publicMessages[error.code]) || fallback);
}
