// Security compatibility barrel for the academic server.
// Keep every existing academic export available while overriding only the
// assessment/grade mutations that require teacher assignment scope checks.
export * from "./server";

export {
  listAssessments,
  createAssessment,
  upsertAssessmentScores,
  upsertTermGrade,
  upsertTermGradesBatch,
  updateAssessmentItem,
  deleteAssessmentItem,
} from "./assessment-server";
