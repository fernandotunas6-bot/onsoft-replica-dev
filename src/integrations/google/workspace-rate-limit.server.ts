import { checkRateLimit, recordRateLimitAttempt } from "@/lib/rate-limit";

const WRITE_WINDOW_MS = 5 * 60_000;
const GLOBAL_WRITE_MAX = 300;

const WRITE_LIMITS: Record<string, number> = {
  "gmail.send": 20,
  "classroom.invite": 40,
  "classroom.coursework.create": 60,
  "calendar.create": 60,
  "drive.folder": 60,
  "drive.text": 60,
  "docs.create": 60,
  "sheets.create": 40,
  "sheets.append": 120,
  "tasks.create": 120,
};

export function assertWorkspaceWriteRateLimit(input: {
  userId: string;
  schoolId: string;
  action: string;
}) {
  const actionMax = WRITE_LIMITS[input.action];
  if (!actionMax) return;

  // One action quota follows the same user across schools so switching school
  // cannot bypass Gmail/Calendar safety limits. The school-specific key adds
  // a second boundary for abusive automation concentrated in one institution.
  const actionKeys = [
    `google:${input.userId}:action:${input.action}`,
    `google:${input.userId}:school:${input.schoolId}:action:${input.action}`,
  ];
  const globalKeys = [`google:${input.userId}:all-writes`];

  if (!checkRateLimit(actionKeys, { windowMs: WRITE_WINDOW_MS, max: actionMax }) ||
      !checkRateLimit(globalKeys, { windowMs: WRITE_WINDOW_MS, max: GLOBAL_WRITE_MAX })) {
    throw Object.assign(
      new Error("Limite temporário de operações Google atingido. Aguarde alguns minutos."),
      { statusCode: 429 },
    );
  }

  recordRateLimitAttempt(actionKeys, { windowMs: WRITE_WINDOW_MS });
  recordRateLimitAttempt(globalKeys, { windowMs: WRITE_WINDOW_MS });
}
