import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/features/pedagogica/components/AssignTeacherForm.tsx"),
  "utf8",
);

describe("atribuição de professor — modal simples do visual master", () => {
  it("apresenta três escolhas num modal compacto sem decoração de duas colunas", () => {
    expect(source).toContain('size="sm"');
    expect(source).not.toContain('size="2xl"');
    expect(source).not.toContain("EducationWorkflowVisual");
    expect(source).not.toContain('subtitle="Escolha a turma, disciplina e professor."');
    expect(source).not.toContain("min-h-[70vh]");
    expect(source.match(/className="h-11 w-full rounded-md border border-input/g)).toHaveLength(3);
    for (const id of ["assign-teacher-class", "assign-teacher-subject", "assign-teacher-person"]) {
      expect(source).toContain(`id="${id}"`);
    }
  });

  it("conserva o vínculo por IDs reais, a filtragem por turma e o refresh", () => {
    expect(source).toContain("subjectIdsForTeacherAssignment({");
    expect(source).toContain("await assignClassSubjectTeacher({");
    expect(source).toContain("data: { classGroupId, subjectId, teacherId }");
    expect(source).toContain("await onAssigned()");
    expect(source).toContain('setSubjectId("")');
  });

  it("impede envio duplicado e impede o fecho durante a operação pendente", () => {
    expect(source).toContain("if (savingRef.current) return;");
    expect(source).toContain("savingRef.current = true;");
    expect(source).toContain("savingRef.current = false;");
    expect(source).toContain("preventOutsideClose={saving}");
    expect(source).toContain("if (!nextOpen && savingRef.current) return;");
    expect(source).toContain(
      "!saving && (classGroupId !== defaultTurmaId || Boolean(subjectId || teacherId))",
    );
    expect(source).toContain("isSubmitting={saving}");
    expect(source).toContain("hasUnsavedChanges={");
    expect(source).not.toContain("onOpenChange={setOpen}");
  });
});
