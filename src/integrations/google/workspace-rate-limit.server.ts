import { checkRateLimit, recordRateLimitAttempt } from "@/lib/rate-limit";

const WRITE_WINDOW_MS = 5 * 60_000;

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
  const max = WRITE_LIMITS[input.action];
  if (!max) return;
  const keys = [
    `google:${input.userId}`,
    `google:${input.userId}:${input.schoolId}`,
    `google:${input.userId}:${input.schoolId}:${input.action}`,
  ];
  if (!checkRateLimit(keys, { windowMs: WRITE_WINDOW_MS, max })) {
    throw Object.assign(
      new Error("Limite temporário de operações Google atingido. Aguarde alguns minutos."),
      { statusCode: 429 },
    );
  }
  recordRateLimitAttempt(keys, { windowMs: WRITE_WINDOW_MS });
}
