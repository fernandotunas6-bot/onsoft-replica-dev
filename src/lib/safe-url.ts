import { z } from "zod";

/**
 * Links guardados por um utilizador e mostrados a outros (convite de WhatsApp da
 * turma, portfólio de alumni, LinkedIn…). `z.string().url()` aceita
 * `javascript:` e `data:`, que correm no browser de quem clica — por isso só
 * http(s). Sem esquema («chat.whatsapp.com/…») assume-se https.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    // Exige domínio com ponto: «linkedin» sozinho não é um endereço.
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function normalizeHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/** href seguro para render: devolve undefined se não for http(s). */
export function safeHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return isHttpUrl(value) ? value : undefined;
}

export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .transform(normalizeHttpUrl)
  .refine(isHttpUrl, { message: "Indique um link válido que comece por https://." });

/** Opcional: vazio e null passam a null. */
export const nullableHttpUrlSchema = z
  .union([z.string().trim().max(2048), z.null()])
  .optional()
  .transform((value) => (value ? normalizeHttpUrl(value) : null))
  .refine((value) => value === null || isHttpUrl(value), {
    message: "Indique um link válido que comece por https://.",
  });

/** Opcional: vazio passa a undefined. */
export const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((value) => (value ? normalizeHttpUrl(value) : undefined))
  .refine((value) => value === undefined || isHttpUrl(value), {
    message: "Indique um link válido que comece por https://.",
  });
