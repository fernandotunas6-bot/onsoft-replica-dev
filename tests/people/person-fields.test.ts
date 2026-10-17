import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPersonInsert,
  sexInitial,
  sexLabel,
  toStoredSex,
} from "@/features/people/person-fields";
import { classGroupChoices } from "@/features/students/enrollment-directory";
import {
  ACADEMIC_STATUS_LABELS,
  academicStatusLabel,
  enrollmentStatusLabel,
  studentStatusChoices,
} from "@/features/students/academic-status";

/**
 * Auditoria 14: «Nova pessoa», «Nova matrícula» e «Aceitar candidatura» montavam
 * cada um a sua ficha. O género «Outro» chegava à base como "outro", que
 * `people_sex_check` recusa (male | female | other | undisclosed).
 */
describe("género como a base o guarda", () => {
  it("o «Outro» do formulário passa a other", () => {
    expect(toStoredSex("outro")).toBe("other");
    expect(toStoredSex("M")).toBe("male");
    expect(toStoredSex("F")).toBe("female");
    expect(toStoredSex("Feminino")).toBe("female");
    expect(toStoredSex("")).toBeNull();
    expect(toStoredSex(undefined)).toBeNull();
    expect(toStoredSex("x")).toBeNull();
  });

  it("todos os valores gravados respeitam people_sex_check", () => {
    const allowed = new Set(["male", "female", "other", "undisclosed", null]);
    for (const value of ["M", "F", "outro", "", "qualquer"]) {
      expect(allowed.has(toStoredSex(value))).toBe(true);
    }
  });

  it("inicial das pautas e rótulo do ecrã vêm do valor gravado", () => {
    expect(sexInitial("male")).toBe("M");
    expect(sexInitial("female")).toBe("F");
    expect(sexInitial("other")).toBe("");
    expect(sexLabel("female")).toBe("Feminino");
    expect(sexLabel("other")).toBe("Outro");
    expect(sexLabel(null)).toBe("—");
  });
});

describe("ficha de pessoa a inserir", () => {
  const ctx = { schoolId: "school-a", userId: "user-1" };

  it("normaliza BI, telefone e género, e só leva a morada quando existe", () => {
    const { payload, hasGeography, nationalId } = buildPersonInsert(
      {
        full_name: "  Ana Maria Domingos ",
        sex: "outro",
        nif: "005123456la042",
        phone_primary: "923 456 789",
      },
      ctx,
    );
    expect(payload).toMatchObject({
      school_id: "school-a",
      full_name: "Ana Maria Domingos",
      preferred_name: "Ana",
      sex: "other",
      national_id: "005123456LA042",
      phone: "+244923456789",
      status: "active",
      created_by: "user-1",
    });
    expect(nationalId).toBe("005123456LA042");
    expect(hasGeography).toBe(false);
    expect(payload).not.toHaveProperty("province");
  });

  it("com morada, as quatro colunas seguem juntas", () => {
    const { payload, hasGeography } = buildPersonInsert(
      { full_name: "Rui Tomás", province: "Huambo" },
      ctx,
    );
    expect(hasGeography).toBe(true);
    expect(payload).toMatchObject({
      province: "Huambo",
      municipality: null,
      commune: null,
      address: null,
    });
  });

  it("os três ecrãs usam a mesma montagem", () => {
    for (const file of [
      "src/features/people/server.ts",
      "src/features/students/server.ts",
      "src/features/enrollment/server.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("buildPersonInsert(");
      expect(source, file).not.toMatch(/sex === "M" \? "male"|function mapSex/);
      expect(source, file).not.toContain("function isMissingPeopleGeography");
    }
  });
});

describe("opções de turma", () => {
  it("o valor é o id: turmas com o mesmo nome e classe já não se confundem", () => {
    const choices = classGroupChoices([
      {
        id: "a",
        name: "A",
        grade_name: "10ª",
        course_name: "Informática",
        academic_year_id: "y",
      },
      {
        id: "b",
        name: "A",
        grade_name: "10ª",
        course_name: "Contabilidade",
        academic_year_id: "y",
      },
      { id: "c", name: "Sem ano", grade_name: "10ª", academic_year_id: null },
    ]);
    expect(choices).toEqual([
      { value: "a", label: "A · 10ª · Informática" },
      { value: "b", label: "A · 10ª · Contabilidade" },
    ]);
  });
});

describe("rótulos de estado: os mesmos em todo o lado", () => {
  it("formulários de estado usam o rótulo do distintivo", () => {
    for (const choice of studentStatusChoices(["applicant"])) {
      expect(choice.label).toBe(ACADEMIC_STATUS_LABELS[choice.value]);
    }
    expect(studentStatusChoices().map((choice) => choice.value)).toEqual([
      "active",
      "inactive",
      "transferred",
      "graduated",
    ]);
    expect(academicStatusLabel("suspended")).toBe("Suspenso");
    expect(academicStatusLabel("desconhecido")).toBe("desconhecido");
  });

  it("estado da matrícula", () => {
    expect(enrollmentStatusLabel("pending")).toBe("Pendente");
    expect(enrollmentStatusLabel("active")).toBe("Activa");
    expect(enrollmentStatusLabel(null)).toBe("Sem matrícula");
  });

  it("a lista e a ficha já não têm mapas próprios", () => {
    for (const file of ["src/routes/alunos/index.tsx", "src/routes/alunos/$studentId.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("const estadoLabels");
      expect(source, file).not.toContain("statusMap");
    }
  });
});
