import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyTeacherContactVisibility,
  parseHiddenTeachers,
  seesAllTeacherContacts,
} from "@/features/people/teacher-contact-visibility";

const rows = [
  { id: "t1", email: "a@escola.ao", phone: "+244923000001" },
  { id: "t2", email: "b@escola.ao", phone: "+244923000002" },
];

describe("contacto do professor: decisão do próprio professor", () => {
  it("por omissão é visível para todos", () => {
    expect(applyTeacherContactVisibility(rows, new Set(), false)).toEqual(rows);
  });

  it("quem ocultou fica sem e-mail e telefone para alunos e encarregados", () => {
    const out = applyTeacherContactVisibility(rows, new Set(["t1"]), false);
    expect(out[0]).toEqual({ id: "t1", email: null, phone: null });
    expect(out[1]).toEqual(rows[1]);
  });

  it("o pessoal da escola vê sempre", () => {
    expect(applyTeacherContactVisibility(rows, new Set(["t1"]), true)).toEqual(rows);
    expect(seesAllTeacherContacts(["Secretaria"])).toBe(true);
    expect(seesAllTeacherContacts(["Professor"])).toBe(true);
    expect(seesAllTeacherContacts(["Aluno"])).toBe(false);
    expect(seesAllTeacherContacts(["Encarregado"])).toBe(false);
  });

  it("lê a lista gravada e ignora lixo", () => {
    expect([...parseHiddenTeachers({ hidden: ["t1", 3, null, "t2"] })]).toEqual(["t1", "t2"]);
    expect(parseHiddenTeachers(null).size).toBe(0);
  });

  it("listTeachers aplica a escolha antes da pesquisa por e-mail", () => {
    const source = readFileSync(join(process.cwd(), "src/features/people/server.ts"), "utf8");
    const start = source.indexOf("export const listTeachers ");
    const body = source.slice(start, source.indexOf("export const ", start + 1));
    const apply = body.indexOf("applyTeacherContactVisibility(");
    const search = body.indexOf('(row.email ?? "").toLowerCase().includes(q)');
    expect(apply).toBeGreaterThan(0);
    expect(search).toBeGreaterThan(apply);
  });
});
