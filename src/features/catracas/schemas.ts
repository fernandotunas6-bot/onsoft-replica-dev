import { z } from "zod";

export const accessCardStatusEnum = z.enum(["active", "suspended", "lost", "expired"]);
export const turnstileDeviceTypeEnum = z.enum(["turnstile", "gate", "door", "scanner_app"]);
export const accessDirectionEnum = z.enum(["entry", "exit"]);
export const accessStatusEnum = z.enum(["granted", "denied"]);

export const issueAccessCardInputSchema = z.object({
  personId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  rfidTag: z.string().optional(),
});

export const validateGatePassTokenInputSchema = z.object({
  token: z.string().min(3, "Token ou código inválido."),
  deviceId: z.string().uuid().optional(),
  direction: accessDirectionEnum.default("entry"),
});

export const registerTurnstileDeviceInputSchema = z.object({
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
  location: z.string().min(2, "Informe a localização (ex: Portaria Principal)."),
  deviceType: turnstileDeviceTypeEnum.default("turnstile"),
  directionCapability: z.enum(["entry", "exit", "bidirectional"]).default("bidirectional"),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
});

export const listAccessLogsInputSchema = z.object({
  personId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  status: accessStatusEnum.optional(),
  date: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
});
