/** Formato BI: 9 dígitos + 2 letras + 3 dígitos (Lei n.º 3/21). */
export const ANGOLA_BI_REGEX = /^\d{9}[A-Z]{2}\d{3}$/;

/** NIF de entidade (pessoa colectiva) — numeração sequencial AGT (9–10 dígitos). */
export const ANGOLA_ENTITY_NIF_REGEX = /^\d{9,10}$/;

export const AGT_NIF_PORTAL_URL =
  "https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte";

export function normalizeAngolaIdentity(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, "");
}

export function validateAngolaBi(value: string): {
  ok: boolean;
  compact?: string;
  error?: string;
} {
  const compact = normalizeAngolaIdentity(value);
  if (compact.length !== 14) {
    return {
      ok: false,
      error: "O BI deve ter 14 caracteres: 9 dígitos, 2 letras e 3 dígitos.",
    };
  }
  if (!ANGOLA_BI_REGEX.test(compact)) {
    return {
      ok: false,
      error: "Formato inválido. Exemplo: 000204688CA010",
    };
  }
  return { ok: true, compact };
}

export function validateAngolaNif(value: string): {
  ok: boolean;
  compact?: string;
  kind?: "individual" | "entity";
  error?: string;
} {
  const compact = normalizeAngolaIdentity(value);
  if (!compact) {
    return { ok: true };
  }
  const bi = validateAngolaBi(compact);
  if (bi.ok) {
    return { ok: true, ...(bi.compact ? { compact: bi.compact } : {}), kind: "individual" };
  }
  if (ANGOLA_ENTITY_NIF_REGEX.test(compact)) {
    return { ok: true, compact, kind: "entity" };
  }
  return {
    ok: false,
    error:
      "NIF inválido. Use o BI (14 caracteres) ou o NIF de entidade (9–10 dígitos). Confirme na AGT.",
  };
}

/** Escolas são entidades; aceita NIF AGT ou formato legado alfanumérico curto. */
export function validateSchoolNif(value: string): {
  ok: boolean;
  compact?: string;
  error?: string;
} {
  const entity = validateAngolaNif(value);
  if (entity.ok && entity.kind === "entity") {
    return { ok: true, ...(entity.compact ? { compact: entity.compact } : {}) };
  }
  const compact = normalizeAngolaIdentity(value);
  if (/^[0-9A-Z]{6,20}$/.test(compact)) {
    return { ok: true, compact };
  }
  return { ok: false, error: entity.error ?? "NIF da escola inválido." };
}

export function formatAngolaBi(value: string): string {
  const compact = normalizeAngolaIdentity(value);
  if (compact.length !== 14) return value.trim();
  return `${compact.slice(0, 3)} ${compact.slice(3, 6)} ${compact.slice(6, 9)} ${compact.slice(9, 11)} ${compact.slice(11)}`;
}

/** Normaliza NIF/BI para gravação em `people.national_id`. */
export function normalizePersonNif(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const checked = validateAngolaNif(value);
  if (!checked.ok) return null;
  return checked.compact ?? normalizeAngolaIdentity(value);
}

export function isAngolaBiNif(value?: string | null): boolean {
  if (!value?.trim()) return false;
  return validateAngolaBi(value).ok;
}
