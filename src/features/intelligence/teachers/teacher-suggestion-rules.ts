import type { SuggestionRule } from "../types";
import type { TeacherRelationsSnapshot } from "./teacher-relations-adapter";

export function buildTeacherSuggestionRules(
  teacherId: string,
): SuggestionRule<TeacherRelationsSnapshot>[] {
  return [
    {
      id: "sem-turmas-atribuidas",
      evaluate: (snapshot) =>
        snapshot.classes.count === 0
          ? {
              id: "sem-turmas-atribuidas",
              priority: 90,
              category: "academico",
              module: "pedagogica",
              requiresWrite: true,
              title: "Atribuir turma e disciplina",
              description: "Este professor ainda não tem turmas nem disciplinas atribuídas.",
              route: `/professores/${teacherId}`,
              reason: "Sem turmas atribuídas neste ano lectivo.",
            }
          : null,
    },
    {
      id: "sem-horario",
      evaluate: (snapshot) =>
        snapshot.classes.count > 0 && snapshot.schedule.count === 0
          ? {
              id: "sem-horario",
              priority: 70,
              category: "academico",
              module: "pedagogica",
              title: "Rever horário semanal",
              description: "As turmas atribuídas ainda não têm slots no horário.",
              route: "/pedagogica",
              reason: "Turmas atribuídas sem horário definido.",
            }
          : null,
    },
    {
      id: "contacto-incompleto",
      evaluate: (snapshot) =>
        !snapshot.profile.hasEmail || !snapshot.profile.hasPhone
          ? {
              id: "contacto-incompleto",
              priority: 60,
              category: "geral",
              module: "pedagogica",
              requiresWrite: true,
              title: "Completar contacto do professor",
              route: `/professores/${teacherId}`,
              reason: "Falta email ou telefone na ficha deste professor.",
            }
          : null,
    },
    {
      id: "emitir-credenciais",
      evaluate: () => ({
        id: "emitir-credenciais",
        priority: 10,
        category: "geral",
        module: "pessoas",
        title: "Emitir credenciais do professor",
        route: `/professores/${teacherId}`,
        reason: "Ação frequente para a ficha deste professor.",
      }),
    },
  ];
}
