export type SchoolAlertKind = "candidaturas" | "matricula" | "documentos" | "faturas";

export type SchoolAlert = {
  id: string;
  kind: SchoolAlertKind;
  title: string;
  detail: string;
  count: number;
  href?: string;
  settingsPanel?: string;
};

export function buildSchoolAlert(kind: SchoolAlertKind, count: number): SchoolAlert | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const many = count !== 1;
  switch (kind) {
    case "candidaturas":
      return {
        id: "candidaturas",
        kind,
        count,
        title: many ? `${count} candidaturas por decidir` : "1 candidatura por decidir",
        detail: "Aceite ou recuse na campanha de matrícula.",
        settingsPanel: "matricula",
      };
    case "matricula":
      return {
        id: "matricula",
        kind,
        count,
        title: many ? `${count} alunos à espera de turma` : "1 aluno à espera de turma",
        detail: "Confirme a matrícula e atribua a turma.",
        href: "/alunos",
      };
    case "documentos":
      return {
        id: "documentos",
        kind,
        count,
        title: many ? `${count} pedidos de documento` : "1 pedido de documento",
        detail: "Há declarações ou certificados por emitir.",
        href: "/documentos",
      };
    case "faturas":
      return {
        id: "faturas",
        kind,
        count,
        title: many ? `${count} faturas em atraso` : "1 fatura em atraso",
        detail: "Cobranças com vencimento ultrapassado.",
        href: "/faturas",
      };
  }
}
