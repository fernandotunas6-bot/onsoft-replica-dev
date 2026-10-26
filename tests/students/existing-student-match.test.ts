import { describe, expect, it } from "vitest";
import { matchExistingStudents } from "@/features/students/existing-student-match";

const alunos = [
  {
    id: "1",
    full_name: "Ana Maria Gonçalves",
    national_id: "004212984LA042",
    phone: "923 456 789",
  },
  { id: "2", full_name: "Ana Paula Domingos", national_id: null, phone: "+244 912 000 111" },
  { id: "3", full_name: "João Gonçalves", national_id: "009988776LA011", phone: null },
];
const ids = (rows: ReturnType<typeof matchExistingStudents>) => rows.map((row) => row.student.id);

describe("Nova matrícula: aluno que já existe na escola", () => {
  it("encontra pelo nome sem acentos nem maiúsculas, com palavras incompletas", () => {
    expect(ids(matchExistingStudents(alunos, { name: "ana goncal" }))).toEqual(["1"]);
    expect(ids(matchExistingStudents(alunos, { name: "GONÇALVES" }))).toEqual([]);
    expect(ids(matchExistingStudents(alunos, { name: "joao goncalves" }))).toEqual(["3"]);
  });

  it("uma só palavra não chega (apanhava meia escola)", () => {
    expect(matchExistingStudents(alunos, { name: "Ana" })).toEqual([]);
  });

  it("BI igual, escrito com espaços ou minúsculas, vem primeiro", () => {
    const rows = matchExistingStudents(alunos, {
      name: "Ana Paula",
      nationalId: "004212984 la042",
    });
    expect(rows.map((row) => [row.student.id, row.reason])).toEqual([
      ["1", "bi"],
      ["2", "nome"],
    ]);
  });

  it("telefone igual com ou sem +244", () => {
    expect(matchExistingStudents(alunos, { phone: "912000111" })).toEqual([
      { student: alunos[1], reason: "telefone" },
    ]);
  });

  it("BI curto ou telefone incompleto não contam", () => {
    expect(matchExistingStudents(alunos, { nationalId: "0042", phone: "923" })).toEqual([]);
  });
});
