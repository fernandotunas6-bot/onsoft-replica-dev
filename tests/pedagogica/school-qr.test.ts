import { describe, expect, it } from "vitest";
import {
  bytesToBase64Url,
  decidePresenceScan,
  distanceMeters,
  formatSchoolQr,
  luandaDateOf,
  mondayOf,
  mondayOfPrintedStep,
  parseSchoolQr,
  printedStepOf,
  rotatingSchoolQrAt,
  safeEqual,
  schoolQrDayKey,
  schoolQrMac,
  schoolQrWeekKey,
  type PresenceScanSettings,
} from "@/features/pedagogica/school-qr";
import { lessonsOpenAt, type TeacherDayLesson } from "@/features/pedagogica/school-qr-server";

const SCHOOL = "11111111-2222-4333-8444-555555555555";
const SECRET = bytesToBase64Url(new Uint8Array(32).map((_, i) => i + 1));
const CENTER = { latitude: -8.8383, longitude: 13.2344 }; // Luanda
// 2026-10-26 08:00 em Luanda = 07:00 UTC
const NOW = Date.parse("2026-10-26T07:00:00Z");

const settings: PresenceScanSettings = {
  rotationSeconds: 30,
  allowPrinted: true,
  requireLocation: true,
  offlineMaxHours: 72,
  center: CENTER,
  radiusM: 250,
};
const atSchool = { latitude: CENTER.latitude + 0.0005, longitude: CENTER.longitude, accuracyM: 20 };

describe("formato do QR da escola", () => {
  it("formata e lê de volta", () => {
    const token = formatSchoolQr(
      { schoolId: SCHOOL, kind: "rotating", step: 59_000_000 },
      "a".repeat(22),
    );
    expect(parseSchoolQr(token)).toEqual({
      schoolId: SCHOOL,
      kind: "rotating",
      step: 59_000_000,
      mac: "a".repeat(22),
    });
  });

  it("recusa o que não é QR do SIGA", () => {
    expect(parseSchoolQr("https://exemplo.ao")).toBeNull();
    expect(parseSchoolQr(`SIGAP1.nao-uuid.R.1.${"a".repeat(22)}`)).toBeNull();
    expect(parseSchoolQr(`SIGAP1.${SCHOOL}.X.1.${"a".repeat(22)}`)).toBeNull();
    expect(parseSchoolQr(`SIGAP1.${SCHOOL}.R.1.curto`)).toBeNull();
  });

  it("a assinatura muda com o segredo, o dia e a versão", async () => {
    const k1 = await schoolQrDayKey(SECRET, "2026-10-26", 1);
    expect(await schoolQrDayKey(SECRET, "2026-10-27", 1)).not.toBe(k1);
    expect(await schoolQrDayKey(SECRET, "2026-10-26", 2)).not.toBe(k1);
    expect(await schoolQrWeekKey(SECRET, "2026-10-26", 1)).not.toBe(k1);
    const mac = await schoolQrMac(k1, { schoolId: SCHOOL, kind: "rotating", step: 7 });
    expect(mac).toHaveLength(22);
    expect(
      safeEqual(mac, await schoolQrMac(k1, { schoolId: SCHOOL, kind: "rotating", step: 7 })),
    ).toBe(true);
    expect(
      safeEqual(mac, await schoolQrMac(k1, { schoolId: SCHOOL, kind: "rotating", step: 8 })),
    ).toBe(false);
  });

  it("o ecrã gera sem rede um QR que o servidor valida com o segredo", async () => {
    const dayKey = await schoolQrDayKey(SECRET, luandaDateOf(NOW), 1);
    const qr = await rotatingSchoolQrAt({
      schoolId: SCHOOL,
      dayKey,
      rotationSeconds: 30,
      nowMs: NOW,
    });
    const parsed = parseSchoolQr(qr.token)!;
    const serverKey = await schoolQrDayKey(SECRET, luandaDateOf(parsed.step * 30_000), 1);
    expect(await schoolQrMac(serverKey, parsed)).toBe(parsed.mac);
    expect(qr.expiresAtMs).toBeGreaterThan(NOW);
  });

  it("semana do QR impresso", () => {
    expect(mondayOf("2026-10-29")).toBe("2026-10-26");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(printedStepOf("2026-10-26")).toBe(20261026);
    expect(mondayOfPrintedStep(20261026)).toBe("2026-10-26");
    expect(mondayOfPrintedStep(20261027)).toBeNull(); // terça não é início de semana
  });

  it("distância em metros", () => {
    expect(distanceMeters(CENTER, CENTER)).toBe(0);
    expect(distanceMeters(CENTER, atSchool)).toBeGreaterThan(40);
    expect(distanceMeters(CENTER, atSchool)).toBeLessThan(70);
  });
});

describe("decisão da leitura", () => {
  const step = Math.floor(NOW / 30_000);

  it("QR do ecrã, na escola, com rede: aceite", () => {
    const result = decidePresenceScan(
      { kind: "rotating", step, receivedAtMs: NOW + 5_000, offline: false, location: atSchool },
      settings,
    );
    expect(result.decision).toBe("accepted");
    expect(result.insideGeofence).toBe(true);
  });

  it("fotografia do QR enviada minutos depois, com rede: recusada", () => {
    const result = decidePresenceScan(
      {
        kind: "rotating",
        step,
        receivedAtMs: NOW + 5 * 60_000,
        offline: false,
        location: atSchool,
      },
      settings,
    );
    expect(result.decision).toBe("rejected");
    expect(result.reasons).toContain("qr_expirado");
  });

  it("QR com passo à frente do servidor: recusada", () => {
    const result = decidePresenceScan(
      { kind: "rotating", step: step + 100, receivedAtMs: NOW, offline: false, location: atSchool },
      settings,
    );
    expect(result.reasons).toContain("qr_do_futuro");
    expect(result.decision).toBe("rejected");
  });

  it("longe da escola: por rever", () => {
    const far = { latitude: -8.9, longitude: 13.3, accuracyM: 10 };
    const result = decidePresenceScan(
      { kind: "rotating", step, receivedAtMs: NOW, offline: false, location: far },
      settings,
    );
    expect(result.decision).toBe("review");
    expect(result.reasons).toContain("fora_da_escola");
  });

  it("telemóvel já usado hoje por outro professor: por rever, mesmo na escola", () => {
    const result = decidePresenceScan(
      {
        kind: "rotating",
        step,
        receivedAtMs: NOW,
        offline: false,
        location: atSchool,
        sharedDevice: true,
      },
      settings,
    );
    expect(result.decision).toBe("review");
    expect(result.reasons).toContain("aparelho_partilhado");
  });

  it("localização falsa no telemóvel: por rever", () => {
    const result = decidePresenceScan(
      {
        kind: "rotating",
        step,
        receivedAtMs: NOW,
        offline: false,
        location: { ...atSchool, mocked: true },
      },
      settings,
    );
    expect(result.decision).toBe("review");
    expect(result.reasons).toContain("localizacao_falsa");
  });

  it("sem rede: lida às 08:00 e enviada à tarde, conta às 08:00", () => {
    const sentAt = NOW + 6 * 3_600_000;
    const result = decidePresenceScan(
      {
        kind: "rotating",
        step,
        receivedAtMs: sentAt,
        offline: true,
        deviceScannedAtMs: NOW + 3_000,
        deviceNowMs: sentAt,
        location: atSchool,
      },
      settings,
    );
    expect(result.decision).toBe("accepted");
    expect(Math.abs(result.scannedAtMs - NOW)).toBeLessThan(60_000);
  });

  it("sem rede com o relógio do telemóvel adiantado: a hora é corrigida", () => {
    const sentAt = NOW + 2 * 3_600_000;
    const skew = 3 * 3_600_000; // telemóvel 3 h adiantado
    const result = decidePresenceScan(
      {
        kind: "rotating",
        step,
        receivedAtMs: sentAt,
        offline: true,
        deviceScannedAtMs: NOW + skew,
        deviceNowMs: sentAt + skew,
        location: atSchool,
      },
      settings,
    );
    expect(result.decision).toBe("accepted");
    expect(Math.abs(result.scannedAtMs - NOW)).toBeLessThan(60_000);
  });

  it("sem rede enviada depois do prazo: recusada", () => {
    const sentAt = NOW + 80 * 3_600_000;
    const result = decidePresenceScan(
      {
        kind: "rotating",
        step,
        receivedAtMs: sentAt,
        offline: true,
        deviceScannedAtMs: NOW,
        deviceNowMs: sentAt,
        location: atSchool,
      },
      settings,
    );
    expect(result.decision).toBe("rejected");
    expect(result.reasons).toContain("offline_expirado");
  });

  it("QR impresso: só com localização na escola", () => {
    const printed = { kind: "printed" as const, step: 20261026, receivedAtMs: NOW, offline: false };
    expect(decidePresenceScan({ ...printed, location: atSchool }, settings).decision).toBe(
      "accepted",
    );
    expect(decidePresenceScan({ ...printed, location: null }, settings).decision).toBe("review");
    expect(
      decidePresenceScan({ ...printed, location: atSchool }, { ...settings, center: null })
        .decision,
    ).toBe("review");
    expect(
      decidePresenceScan({ ...printed, location: atSchool }, { ...settings, allowPrinted: false })
        .decision,
    ).toBe("rejected");
    expect(
      decidePresenceScan({ ...printed, step: 20261019, location: atSchool }, settings).reasons,
    ).toContain("qr_impresso_fora_da_semana");
  });
});

describe("aulas abertas na hora da leitura", () => {
  const lesson = (
    id: string,
    startsAt: string,
    endsAt: string,
    status = "pending",
  ): TeacherDayLesson => ({
    sessionId: id,
    classGroupId: "g",
    classGroupName: "10.ª A",
    subjectId: "s",
    subjectName: "Matemática",
    room: null,
    lessonDate: "2026-10-26",
    startsAt,
    endsAt,
    status,
    presence: {
      teacher_checked_in_at: null,
      teacher_checkin_method: null,
      teacher_late_minutes: null,
      teacher_checked_out_at: null,
      teacher_presence_note: null,
    },
  });
  const day = [
    lesson("a", "07:30:00", "08:15:00"),
    lesson("b", "08:15:00", "09:00:00"),
    lesson("c", "10:00:00", "10:45:00"),
    lesson("x", "08:00:00", "08:45:00", "cancelled"),
  ];

  it("de 15 min antes do início até ao fim", () => {
    expect(lessonsOpenAt(day, "07:10").map((l) => l.sessionId)).toEqual([]);
    expect(lessonsOpenAt(day, "07:20").map((l) => l.sessionId)).toEqual(["a"]);
    expect(lessonsOpenAt(day, "08:05").map((l) => l.sessionId)).toEqual(["a", "b"]);
    expect(lessonsOpenAt(day, "08:20").map((l) => l.sessionId)).toEqual(["b"]);
    expect(lessonsOpenAt(day, "09:30").map((l) => l.sessionId)).toEqual([]);
  });
});
