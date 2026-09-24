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
): GateEventResult {
  if (!expectedSchoolId || !Number.isFinite(maxClockSkewMinutes) || maxClockSkewMinutes < 0) {
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
    if (seen.has(key)) {
      rejected.push({ event, reason: "Evento duplicado." });
      continue;
    }
    seen.add(key);
    const occurred = Date.parse(event.occurredAt);
    const received = Date.parse(event.receivedAt);
    if (!Number.isFinite(occurred) || !Number.isFinite(received) ||
        !/(?:Z|[+-]\d\d:\d\d)$/.test(event.occurredAt) ||
        !/(?:Z|[+-]\d\d:\d\d)$/.test(event.receivedAt)) {
      rejected.push({ event, reason: "Timestamp inválido ou sem fuso horário." });
      continue;
    }
    if (occurred > received + maxClockSkewMinutes * 60000) {
      warnings.push({ event, reason: "Relógio do dispositivo adiantado; verificar antes de utilizar." });
    }
    if (received - occurred > 24 * 60 * 60000) {
      warnings.push({ event, reason: "Evento antigo ou sincronização tardia; verificar." });
    }
    accepted.push(event);
  }
  return { accepted, rejected, warnings };
}
