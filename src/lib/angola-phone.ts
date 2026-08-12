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
