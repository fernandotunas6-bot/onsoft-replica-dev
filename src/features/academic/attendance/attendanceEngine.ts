import { parseStrictTimestamp } from "./strictTimestamp";

export type AttendanceEvidence = "gate" | "lesson_qr" | "manual";
export type AttendanceStatus = "present" | "late" | "partial" | "absent" | "excused" | "pending_review";
export type ScheduledLesson = {
  id: string; teacherId: string; schoolId: string; classGroupId: string;
  startsAt: string; endsAt: string; cancelled?: boolean;
};
export type AttendanceEvent = {
  id: string; lessonId: string; teacherId: string; schoolId: string;
  kind: "check_in" | "check_out"; occurredAt: string;
  evidence: AttendanceEvidence; verified: boolean;
};
export type AttendancePolicy = {
  graceMinutes: number;
  minimumPresencePercent: number;
  requireVerifiedQr: boolean;
};
export type LessonAttendance = {
  lessonId: string; status: AttendanceStatus; scheduledMinutes: number;
  verifiedMinutes: number; lateMinutes: number; evidenceIds: string[];
  reasons: string[];
};
export type PayrollPolicy = {
  currency: "AOA"; monthlyBaseCents: number; monthlyContractMinutes: number;
  deductionEnabled: boolean; approvedByHr: boolean;
  expectedLessonCount?: number; // supplied by the authoritative published timetable
  expectedLessonIds?: readonly string[]; // authoritative lesson identities, not just count
  expectedLessonMinutes?: Readonly<Record<string, number>>; // authoritative durations
};
export type PayrollPreview = {
  scheduledMinutes: number; verifiedMinutes: number; unverifiedMinutes: number;
  proposedDeductionCents: number; payableBaseCents: number; requiresHrApproval: boolean;
};

function timestamp(value: string): number {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("A data deve incluir o fuso horário.");
  }
  const result = parseStrictTimestamp(value);
  if (result === null) throw new Error("Data inválida.");
  return result;
}
function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(name + " inválido.");
}
export function evaluateLessonAttendance(
  lesson: ScheduledLesson, events: AttendanceEvent[], policy: AttendancePolicy,
  excused = false,
): LessonAttendance {
  positiveInteger(policy.graceMinutes, "Tolerância");
  if (!Number.isFinite(policy.minimumPresencePercent) || policy.minimumPresencePercent < 0 || policy.minimumPresencePercent > 100)
    throw new Error("Percentagem mínima inválida.");
  const start = timestamp(lesson.startsAt);
  const end = timestamp(lesson.endsAt);
  if (end <= start) throw new Error("A aula deve terminar depois de começar.");
  if (end - start > 24 * 60 * 60 * 1000) throw new Error("Duração da aula superior a 24 horas.");
  const scheduledMinutes = Math.ceil((end - start) / 60000);
  const base = { lessonId: lesson.id, scheduledMinutes, verifiedMinutes: 0, lateMinutes: 0, evidenceIds: [] as string[], reasons: [] as string[] };
  if (lesson.cancelled) return { ...base, status: "excused", reasons: ["Aula cancelada; não gera falta."] };
  if (excused) return { ...base, status: "excused", reasons: ["Justificação registada; aguarda política de remuneração."] };
  const scopedEvents = events.filter((event) =>
    event.lessonId === lesson.id && event.teacherId === lesson.teacherId &&
    event.schoolId === lesson.schoolId,
  );
  // JSON from a device can bypass TypeScript types. A malformed verified
  // event must be reviewed, rather than silently counted as QR evidence.
  if (scopedEvents.some((event) =>
    typeof event.verified !== "boolean" ||
    !["gate", "lesson_qr", "manual"].includes(event.evidence) ||
    !["check_in", "check_out"].includes(event.kind))) {
    return { ...base, status: "pending_review",
      evidenceIds: scopedEvents.map((event) => event.id),
      reasons: ["Formato de evidência inválido; requer revisão."] };
  }
  const relevant = scopedEvents.filter((event) =>
    event.verified === true &&
    (!policy.requireVerifiedQr || event.evidence === "lesson_qr"),
  );
  // Malformed evidence is quarantined instead of crashing the whole payroll run.
  if (relevant.some((event) => {
    try { timestamp(event.occurredAt); return false; } catch { return true; }
  })) {
    return { ...base, status: "pending_review", evidenceIds: relevant.map((event) => event.id),
      reasons: ["Evento validado com timestamp inválido; requer revisão."] };
  }
  relevant.sort((a, b) => timestamp(a.occurredAt) - timestamp(b.occurredAt));
  const checkIns = relevant.filter((event) => event.kind === "check_in");
  if (checkIns.length === 0) return { ...base, status: "pending_review", reasons: ["Sem entrada validada; confirmar antes de apurar falta."] };
  const checkOuts = relevant.filter((event) => event.kind === "check_out");
  // Conflicting or repeated scans are reviewed rather than selecting a favorable
  // pair; the backend must also enforce unique one-time challenges.
  if (checkIns.length !== 1 || checkOuts.length !== 1) {
    return { ...base, status: "pending_review", evidenceIds: relevant.map((event) => event.id),
      reasons: ["Leituras duplicadas ou contraditórias; requer revisão."] };
  }
  const checkIn = checkIns[0];
  const checkOut = checkOuts[0];
  const inTime = timestamp(checkIn.occurredAt);
  const outTime = timestamp(checkOut.occurredAt);
  if (outTime <= inTime) return { ...base, status: "pending_review",
    evidenceIds: [checkIn.id, checkOut.id], reasons: ["Saída anterior ou igual à entrada."] };
  if (inTime < start - policy.graceMinutes * 60000 || inTime >= end ||
      outTime <= start || outTime > end + policy.graceMinutes * 60000) {
    return { ...base, status: "pending_review", evidenceIds: [checkIn.id, checkOut.id],
      reasons: ["Leitura fora da janela permitida; requer revisão."] };
  }
  const boundedStart = Math.max(start, inTime);
  const boundedEnd = Math.min(end, outTime);
  const verifiedMinutes = Math.max(0, Math.floor((boundedEnd - boundedStart) / 60000));
  const lateMinutes = Math.max(0, Math.ceil((inTime - start) / 60000));
  const percent = verifiedMinutes / scheduledMinutes * 100;
  const status: AttendanceStatus = percent < policy.minimumPresencePercent ? "partial" :
    lateMinutes > policy.graceMinutes ? "late" : "present";
  return { ...base, status, verifiedMinutes, lateMinutes, evidenceIds: [checkIn.id, checkOut.id],
    reasons: status === "partial" ? ["Permanência inferior ao mínimo configurado."] : [] };
}
export function previewPayroll(
  attendance: LessonAttendance[], policy: PayrollPolicy,
): PayrollPreview {
  positiveInteger(policy.monthlyBaseCents, "Salário base");
  positiveInteger(policy.monthlyContractMinutes, "Carga horária contratual");
  if (policy.monthlyContractMinutes === 0) throw new Error("A carga horária contratual não pode ser zero.");
  if (policy.expectedLessonCount !== undefined) positiveInteger(policy.expectedLessonCount, "Número de aulas previstas");
  const expectedIds = policy.expectedLessonIds;
  const expectedMinutes = policy.expectedLessonMinutes;
  const invalidExpectedMinutes = expectedIds === undefined || expectedMinutes === undefined ||
    Object.keys(expectedMinutes ?? {}).length !== (expectedIds?.length ?? 0) ||
    expectedIds?.some((id) => !Number.isSafeInteger(expectedMinutes?.[id]) || (expectedMinutes?.[id] ?? 0) <= 0) === true;
  const invalidExpectedIds = expectedIds === undefined || expectedIds.some((id) => !id) ||
    (expectedIds !== undefined && new Set(expectedIds).size !== expectedIds.length);
  const actualIds = new Set(attendance.map((entry) => entry.lessonId));
  const incompleteRoster = invalidExpectedIds || invalidExpectedMinutes || policy.expectedLessonCount === undefined ||
    policy.expectedLessonCount !== attendance.length || expectedIds?.length !== attendance.length ||
    expectedIds?.some((id) => !actualIds.has(id)) === true;
  const lessonIds = new Set<string>();
  for (const entry of attendance) {
    if (!entry.lessonId || lessonIds.has(entry.lessonId)) {
      throw new Error("Aulas duplicadas ou sem identificação no apuramento mensal.");
    }
    lessonIds.add(entry.lessonId);
    // API payloads have no TypeScript types at runtime. Unknown states must
    // never fall through to the financially resolved branch.
    if (!["present", "late", "partial", "absent", "excused", "pending_review"].includes(entry.status)) {
      throw new Error("Estado de presença inválido; requer revisão.");
    }
    positiveInteger(entry.scheduledMinutes, "Minutos previstos");
    if (expectedMinutes !== undefined && Object.hasOwn(expectedMinutes, entry.lessonId) &&
        entry.scheduledMinutes !== expectedMinutes[entry.lessonId]) {
      throw new Error("Duração da aula diverge do horário oficial.");
    }
    positiveInteger(entry.verifiedMinutes, "Minutos confirmados");
    positiveInteger(entry.lateMinutes, "Minutos de atraso");
    if (entry.verifiedMinutes > entry.scheduledMinutes ||
        (entry.status === "pending_review" && entry.verifiedMinutes !== 0) ||
        (entry.status === "excused" && entry.verifiedMinutes !== 0) ||
        (entry.status === "absent" && entry.verifiedMinutes !== 0)) {
      throw new Error("Registo de presença inconsistente; requer revisão.");
    }
  }
  const eligible = attendance.filter((entry) => entry.status !== "excused");
  const scheduledMinutes = eligible.reduce((sum, entry) => sum + entry.scheduledMinutes, 0);
  const verifiedMinutes = eligible.reduce((sum, entry) => sum + entry.verifiedMinutes, 0);
  // Unresolved scans must NEVER become an automatic financial deduction.
  const resolved = eligible.filter((entry) => entry.status !== "pending_review");
  const unverifiedMinutes = eligible.filter((entry) => entry.status === "pending_review")
    .reduce((sum, entry) => sum + entry.scheduledMinutes, 0);
  const missingMinutes = resolved.reduce((sum, entry) =>
    sum + Math.max(0, entry.scheduledMinutes - entry.verifiedMinutes), 0);
  // Money remains integer cents. BigInt prevents precision loss when the
  // salary and scheduled minutes are both large; half-cents round up.
  const cappedMissingMinutes = Math.min(missingMinutes, policy.monthlyContractMinutes);
  const proposedDeductionCents = policy.deductionEnabled && policy.approvedByHr && !incompleteRoster && unverifiedMinutes === 0
    ? Number((BigInt(policy.monthlyBaseCents) * BigInt(cappedMissingMinutes)
        + BigInt(policy.monthlyContractMinutes) / 2n) / BigInt(policy.monthlyContractMinutes))
    : 0;
  return { scheduledMinutes, verifiedMinutes, unverifiedMinutes, proposedDeductionCents,
    payableBaseCents: policy.monthlyBaseCents - proposedDeductionCents,
    requiresHrApproval: incompleteRoster || unverifiedMinutes > 0 || !policy.approvedByHr };
}
