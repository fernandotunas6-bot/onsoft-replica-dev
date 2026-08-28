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
  direction: accessDirectionEnum.optional(),
  date: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
});

export const setAccessCardStatusInputSchema = z.object({
  cardId: z.string().uuid(),
  status: accessCardStatusEnum,
});

export const updateTurnstileDeviceInputSchema = z.object({
  deviceId: z.string().uuid(),
  status: z.enum(["online", "offline", "maintenance"]).optional(),
  ipAddress: z.string().max(64).optional().nullable(),
  name: z.string().min(3).max(120).optional(),
  location: z.string().min(2).max(160).optional(),
});

export const linkAccessCardRfidInputSchema = z.object({
  cardId: z.string().uuid(),
  rfidTag: z.string().max(64).nullable().optional(),
});

export const rotateAccessCardQrInputSchema = z.object({
  cardId: z.string().uuid(),
});

export const listAccessCardsInputSchema = z.object({
  status: accessCardStatusEnum.optional(),
  search: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(200).default(80),
});

/** Webhook para controladores físicos (sem sessão — autentica por api_key do dispositivo). */
export const validateGatePassDeviceInputSchema = z.object({
  apiKey: z.string().min(8, "API key inválida."),
  token: z.string().min(3, "Token ou código inválido."),
  direction: accessDirectionEnum.default("entry"),
});
