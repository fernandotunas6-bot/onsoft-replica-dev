export function normalizeAngolaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("244") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 9 && digits.startsWith("9")) {
    return `+244${digits}`;
  }
  return value.trim();
}

export function validateAngolaPhone(value: string): {
  ok: boolean;
  compact?: string;
  error?: string;
} {
  const compact = normalizeAngolaPhone(value).replace(/\s/g, "");
  if (!/^\+2449\d{8}$/.test(compact)) {
    return {
      ok: false,
      error: "Telefone inválido. Use +244 9XX XXX XXX (9 dígitos móveis).",
    };
  }
  return { ok: true, compact };
}

export function formatAngolaPhone(value: string): string {
  const compact = normalizeAngolaPhone(value).replace(/\s/g, "");
  if (!/^\+2449\d{8}$/.test(compact)) return value.trim();
  const local = compact.slice(4);
  return `+244 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/**
 * Telefone para gravar: angolano normalizado (+2449XXXXXXXX) ou internacional
 * com indicativo (+ e 8 a 15 dígitos). Devolve null se não for nenhum dos dois —
 * a base recusaria o valor com uma mensagem que o utilizador não percebe.
 */
export function normalizeStoredPhone(value: string): string | null {
  const angola = validateAngolaPhone(value);
  if (angola.ok && angola.compact) return angola.compact;
  const international = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}
