import type { RelationMap } from "../types";
import type { TeacherRelationsSnapshot } from "./teacher-relations-adapter";

export function buildTeacherRelationMap(teacherId: string): RelationMap<TeacherRelationsSnapshot> {
  return [
    {
      key: "turmas",
      label: "Turmas",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.classes.count === 0 ? "empty" : "ok",
        summary:
          snapshot.classes.count === 0
            ? "Sem turmas atribuídas"
            : `${snapshot.classes.count} turma(s)`,
        route: `/professores/${teacherId}`,
      }),
    },
    {
      key: "disciplinas",
      label: "Disciplinas",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.classes.subjectCount === 0 ? "empty" : "ok",
        summary:
          snapshot.classes.subjectCount === 0
            ? "Sem disciplinas atribuídas"
            : `${snapshot.classes.subjectCount} disciplina(s)`,
        route: `/professores/${teacherId}`,
      }),
    },
    {
      key: "horario",
      label: "Horário",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.schedule.count === 0 ? "empty" : "ok",
        summary:
          snapshot.schedule.count === 0
            ? "Sem slots no horário"
            : `${snapshot.schedule.count} slot(s) semanais`,
        route: "/pedagogica",
      }),
    },
    {
      key: "alunos",
      label: "Alunos",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.enrollments.count === 0 ? "empty" : "ok",
        summary:
          snapshot.enrollments.count === 0
            ? "Sem alunos matriculados nas suas turmas"
            : `${snapshot.enrollments.count} aluno(s) matriculado(s)`,
        route: `/professores/${teacherId}`,
      }),
    },
    {
      key: "contacto",
      label: "Contacto",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.profile.hasEmail && snapshot.profile.hasPhone ? "ok" : "attention",
        summary:
          snapshot.profile.hasEmail && snapshot.profile.hasPhone
            ? "Contacto completo"
            : "Contacto incompleto",
        route: `/professores/${teacherId}`,
      }),
    },
  ];
}
