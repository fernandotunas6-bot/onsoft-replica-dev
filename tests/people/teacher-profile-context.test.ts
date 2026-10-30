import { describe, expect, it } from "vitest";
import {
  plannedLessonsToday,
  resolveTeacherLevels,
} from "@/features/people/teacher-profile-context";

describe("contexto do perfil do professor", () => {
  it("distingue níveis atribuídos dos níveis configurados na escola", () => {
    expect(
      resolveTeacherLevels(
        ["2.ª Classe", "11.ª Classe", "1º Ano"],
        ["primario", "ii_ciclo", "superior"],
      ),
    ).toEqual({
      assigned: ["primario", "ii_ciclo", "superior"],
      school: ["primario", "ii_ciclo", "superior"],
    });
  });
  it("não deduz níveis do tipo jurídico ou de turmas sem classificação", () => {
    expect(resolveTeacherLevels(["Turma A"], ["privada", "confessional"])).toEqual({
      assigned: [],
      school: [],
    });
  });
  it("não atribui ao professor todos os níveis de uma escola mista", () => {
    expect(resolveTeacherLevels(["8.ª Classe"], ["primario", "i_ciclo", "ii_ciclo"])).toEqual({
      assigned: ["i_ciclo"],
      school: ["primario", "i_ciclo", "ii_ciclo"],
    });
  });
  it("selecciona apenas os tempos de hoje no fuso Africa/Luanda", () => {
    const slots = [
      { id: "1", weekday_label: "Segunda-feira" },
      { id: "2", weekday_label: "2ª-feira" },
      { id: "3", weekday_label: "Terça-feira" },
    ];
    expect(plannedLessonsToday(slots, new Date("2026-10-26T23:30:00Z"))).toEqual([slots[2]]);
    expect(plannedLessonsToday(slots, new Date("2026-10-26T08:00:00Z"))).toEqual([
      slots[0],
      slots[1],
    ]);
  });
});
