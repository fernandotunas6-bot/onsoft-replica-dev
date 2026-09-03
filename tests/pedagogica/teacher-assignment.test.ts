import { describe, expect, it } from "vitest";
import { subjectIdsForTeacherAssignment } from "@/features/pedagogica/teacher-assignment";

describe("teacher assignment subject filter", () => {
  it("shows only subjects linked to the selected class when curriculum exists", () => {
    expect(
      subjectIdsForTeacherAssignment({
        classGroupId: "turma-a",
        subjectIds: ["mat", "fis", "qui"],
        classSubjectLinks: [
          { class_group_id: "turma-a", subject_id: "mat" },
          { class_group_id: "turma-a", subject_id: "fis" },
          { class_group_id: "turma-b", subject_id: "qui" },
        ],
      }),
    ).toEqual(["mat", "fis"]);
  });

  it("keeps the legacy first-assignment path for a class without curriculum links", () => {
    expect(
      subjectIdsForTeacherAssignment({
        classGroupId: "turma-sem-curriculo",
        subjectIds: ["mat", "fis"],
        classSubjectLinks: [{ class_group_id: "outra-turma", subject_id: "mat" }],
      }),
    ).toEqual(["mat", "fis"]);
  });

  it("ignores inactive class-subject links", () => {
    expect(
      subjectIdsForTeacherAssignment({
        classGroupId: "turma-a",
        subjectIds: ["mat", "fis"],
        classSubjectLinks: [
          { class_group_id: "turma-a", subject_id: "mat", status: "inactive" },
          { class_group_id: "turma-a", subject_id: "fis", status: "active" },
        ],
      }),
    ).toEqual(["fis"]);
  });
});
