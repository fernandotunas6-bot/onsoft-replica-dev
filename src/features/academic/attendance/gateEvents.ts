import { parseStrictTimestamp } from "./strictTimestamp";

/** Normalização determinística de eventos de catraca, sem alterar presença em aulas. */
export type GateDirection = "entry" | "exit";
export type GateEvent = {
  deviceId: string; externalEventId: string; schoolId: string; teacherId: string;
  direction: GateDirection; occurredAt: string; receivedAt: string;
};
export type GateEventResult = {
  accepted: GateEvent[]; rejected: Array<{ event: GateEvent; reason: string }>;
  warnings: Array<{ event: GateEvent; reason: string }>;
};
export function reconcileGateEvents(
  events: GateEvent[], expectedSchoolId: string, knownDeviceIds: ReadonlySet<string>,
  maxClockSkewMinutes = 5,
  previouslyProcessedKeys: ReadonlySet<string> = new Set(),
): GateEventResult {
  if (!expectedSchoolId || !Number.isSafeInteger(maxClockSkewMinutes) || maxClockSkewMinutes < 0 || maxClockSkewMinutes > 240) {
    throw new Error("Configuração de catracas inválida.");
  }
  const seen = new Set<string>();
  const accepted: GateEvent[] = [];
  const rejected: GateEventResult["rejected"] = [];
  const warnings: GateEventResult["warnings"] = [];
  for (const event of events) {
    const key = JSON.stringify([event.deviceId, event.externalEventId]);
    if (!event.deviceId || !event.externalEventId || !event.teacherId ||
        event.schoolId !== expectedSchoolId || !knownDeviceIds.has(event.deviceId) ||
        (event.direction !== "entry" && event.direction !== "exit")) {
      rejected.push({ event, reason: "Dispositivo, instituição, docente ou sentido inválido." });
      continue;
    }
    if (seen.has(key) || previouslyProcessedKeys.has(key)) {
      rejected.push({ event, reason: "Evento duplicado." });
      continue;
    }
    const occurred = parseStrictTimestamp(event.occurredAt);
    const received = parseStrictTimestamp(event.receivedAt);
    if (occurred === null || received === null) {
      rejected.push({ event, reason: "Timestamp inválido ou sem fuso horário." });
      continue;
    }
    if (occurred > received + maxClockSkewMinutes * 60000) {
      warnings.push({ event, reason: "Relógio do dispositivo adiantado; verificar antes de utilizar." });
      continue;
    }
    if (received - occurred > 24 * 60 * 60000) {
      warnings.push({ event, reason: "Evento antigo ou sincronização tardia; verificar." });
      continue;
    }
    // Quarantined events are not consumed: a corrected retransmission can
    // still be accepted, while an accepted event remains idempotent.
    seen.add(key);
    accepted.push(event);
  }
  return { accepted, rejected, warnings };
}
