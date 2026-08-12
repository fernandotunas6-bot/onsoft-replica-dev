import { describe, expect, it } from "vitest";
import {
  buildAcademicNavTree,
  gradeClassLabel,
  isClassTeacherLevel,
  resolveTeachingLevelId,
} from "@/lib/academic-nav";

describe("academic nav tree", () => {
  it("trata primário como docência da turma e o I/II ciclo como disciplina", () => {
    expect(isClassTeacherLevel("1ª Classe")).toBe(true);
    expect(isClassTeacherLevel("Iniciação A")).toBe(true);
    expect(isClassTeacherLevel("9ª Classe")).toBe(false);
    expect(isClassTeacherLevel("10ª CFB")).toBe(false);
    expect(resolveTeachingLevelId("10ª Classe")).toBe("ii_ciclo");
    expect(gradeClassLabel("1ª A")).toBe("1ª Classe");
  });

  it("agrupa por classe no primário e abre a turma sem exigir disciplina", () => {
    const tree = buildAcademicNavTree([
      {
        classGroupId: "t1",
        className: "1ª A",
        gradeName: "1ª Classe",
        subjectId: "lp",
        subjectName: "Língua Portuguesa",
      },
      {
        classGroupId: "t1",
        className: "1ª A",
        gradeName: "1ª Classe",
        subjectId: "mat",
        subjectName: "Matemática",
      },
    ]);
    expect(tree[0]?.label).toBe("1ª Classe");
    expect(tree[0]?.classTeacher).toBe(true);
    expect(tree[0]?.classes[0]?.classTeacher).toBe(true);
    expect(tree[0]?.classes[0]?.subjects).toHaveLength(2);
  });

  it("agrupa II ciclo por curso e 9ª por classe", () => {
    const tree = buildAcademicNavTree([
      {
        classGroupId: "cfb-a",
        className: "10ª A",
        gradeName: "10ª Classe",
        courseName: "CFB",
        subjectId: "fis",
        subjectName: "Física",
      },
      {
        classGroupId: "nona",
        className: "9ª B",
        gradeName: "9ª Classe",
        courseName: "—",
        subjectId: "hist",
        subjectName: "História",
      },
    ]);
    expect(tree.map((branch) => branch.label)).toEqual(["9ª Classe", "CFB"]);
    expect(tree.find((branch) => branch.label === "CFB")?.kind).toBe("course");
    expect(tree.find((branch) => branch.label === "9ª Classe")?.classTeacher).toBe(false);
  });
});
