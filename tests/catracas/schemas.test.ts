import { describe, it, expect } from "vitest";
import {
  issueAccessCardInputSchema,
  validateGatePassTokenInputSchema,
  registerTurnstileDeviceInputSchema,
  listAccessLogsInputSchema,
  setAccessCardStatusInputSchema,
  updateTurnstileDeviceInputSchema,
  listAccessCardsInputSchema,
  validateGatePassDeviceInputSchema,
} from "@/features/catracas/schemas";

describe("Turnstiles & Access Control Schemas", () => {
  it("validates access card issuance input", () => {
    const validCard = {
      personId: "123e4567-e89b-12d3-a456-426614174000",
      studentId: "123e4567-e89b-12d3-a456-426614174001",
      rfidTag: "RFID-WIEGAND-99120",
    };
    const parsed = issueAccessCardInputSchema.parse(validCard);
    expect(parsed.personId).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(parsed.rfidTag).toBe("RFID-WIEGAND-99120");
  });

  it("validates turnstile gate token validation input", () => {
    const validToken = {
      token: "STU2026884920",
      direction: "entry" as const,
    };
    const parsed = validateGatePassTokenInputSchema.parse(validToken);
    expect(parsed.token).toBe("STU2026884920");
    expect(parsed.direction).toBe("entry");
  });

  it("validates turnstile hardware device registration schema", () => {
    const validDevice = {
      name: "Catraca 01 - Portaria Principal",
      location: "Portaria Principal",
      deviceType: "turnstile" as const,
      ipAddress: "192.168.1.150",
    };
    const parsed = registerTurnstileDeviceInputSchema.parse(validDevice);
    expect(parsed.name).toBe("Catraca 01 - Portaria Principal");
    expect(parsed.deviceType).toBe("turnstile");
  });

  it("validates access log filters schema", () => {
    const filters = {
      limit: 100,
      status: "granted" as const,
    };
    const parsed = listAccessLogsInputSchema.parse(filters);
    expect(parsed.limit).toBe(100);
    expect(parsed.status).toBe("granted");
  });

  it("requires a valid UUID for the card holder's person id", () => {
    expect(issueAccessCardInputSchema.safeParse({ personId: "not-a-uuid" }).success).toBe(false);
    expect(
      issueAccessCardInputSchema.safeParse({
        personId: "123e4567-e89b-12d3-a456-426614174000",
      }).success,
    ).toBe(true);
  });

  it("defaults the gate pass direction to entry when omitted", () => {
    const parsed = validateGatePassTokenInputSchema.parse({ token: "STU2026884920" });
    expect(parsed.direction).toBe("entry");
  });

  it("rejects a gate pass token shorter than 3 characters", () => {
    expect(validateGatePassTokenInputSchema.safeParse({ token: "ab" }).success).toBe(false);
  });

  it("only accepts entry or exit as the gate pass direction", () => {
    expect(
      validateGatePassTokenInputSchema.safeParse({ token: "STU2026884920", direction: "sideways" })
        .success,
    ).toBe(false);
  });

  it("defaults the turnstile device type and direction capability when omitted", () => {
    const parsed = registerTurnstileDeviceInputSchema.parse({
      name: "Catraca 02",
      location: "Portaria Secundária",
    });
    expect(parsed.deviceType).toBe("turnstile");
    expect(parsed.directionCapability).toBe("bidirectional");
  });

  it("rejects a device name or location that is too short", () => {
    expect(
      registerTurnstileDeviceInputSchema.safeParse({ name: "C", location: "Portaria" }).success,
    ).toBe(false);
    expect(
      registerTurnstileDeviceInputSchema.safeParse({ name: "Catraca 03", location: "P" }).success,
    ).toBe(false);
  });

  it("defaults the access log limit and rejects an out-of-range value", () => {
    expect(listAccessLogsInputSchema.parse({}).limit).toBe(50);
    expect(listAccessLogsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listAccessLogsInputSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it("only accepts granted or denied as the access log status filter", () => {
    expect(listAccessLogsInputSchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("accepts direction filter on access logs", () => {
    expect(listAccessLogsInputSchema.parse({ direction: "exit" }).direction).toBe("exit");
  });

  it("validates setAccessCardStatus transitions", () => {
    const parsed = setAccessCardStatusInputSchema.parse({
      cardId: "123e4567-e89b-12d3-a456-426614174000",
      status: "suspended",
    });
    expect(parsed.status).toBe("suspended");
    expect(
      setAccessCardStatusInputSchema.safeParse({
        cardId: "123e4567-e89b-12d3-a456-426614174000",
        status: "unknown",
      }).success,
    ).toBe(false);
  });

  it("validates updateTurnstileDevice status and IP", () => {
    const parsed = updateTurnstileDeviceInputSchema.parse({
      deviceId: "123e4567-e89b-12d3-a456-426614174000",
      status: "maintenance",
      ipAddress: "192.168.1.10",
    });
    expect(parsed.status).toBe("maintenance");
    expect(
      updateTurnstileDeviceInputSchema.safeParse({
        deviceId: "not-uuid",
      }).success,
    ).toBe(false);
  });

  it("validates listAccessCards filters", () => {
    const parsed = listAccessCardsInputSchema.parse({ status: "active", search: "CARD" });
    expect(parsed.status).toBe("active");
    expect(listAccessCardsInputSchema.parse({}).limit).toBe(80);
  });

  it("validates device webhook input with apiKey", () => {
    const parsed = validateGatePassDeviceInputSchema.parse({
      apiKey: "KEY-ABCD1234",
      token: "STU2026884920",
      direction: "exit",
    });
    expect(parsed.direction).toBe("exit");
    expect(
      validateGatePassDeviceInputSchema.safeParse({ apiKey: "short", token: "x" }).success,
    ).toBe(false);
  });
});
