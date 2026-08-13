export { ScheduleWorkspace } from "./ScheduleWorkspace";
export {
  buildScheduleChangeNotification,
  exportScheduleSlotAsIcs,
  getClassGroupSchedule,
  getTeacherSchedule,
} from "./services/calendar";
export { detectScheduleConflicts } from "./utils/conflicts";
export type {
  ScheduleClassGroup,
  ScheduleConflict,
  ScheduleSlot,
  ScheduleSlotInput,
  ScheduleSlotUpdate,
  ScheduleSubject,
} from "./types";
