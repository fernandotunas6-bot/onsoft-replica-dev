/** Formato BI: 9 dígitos + 2 letras + 3 dígitos (Lei n.º 3/21). */
export const ANGOLA_BI_REGEX = /^\d{9}[A-Z]{2}\d{3}$/;

/** NIF de entidade (pessoa colectiva) — numeração sequencial AGT (9–10 dígitos). */
export const ANGOLA_ENTITY_NIF_REGEX = /^\d{9,10}$/;

export const AGT_NIF_PORTAL_URL =
  "https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte";

export const ANGOLA_BI_PUBLIC_API_BASE = "https://angolaapi.herokuapp.com/api/v1/validate/bi";

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

export async function lookupAngolaBiOnline(bi: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const validated = validateAngolaBi(bi);
  if (!validated.ok) {
    return { ok: false, message: validated.error ?? "BI inválido." };
  }
  try {
    const response = await fetch(`${ANGOLA_BI_PUBLIC_API_BASE}/${validated.compact}`);
    if (!response.ok) {
      return {
        ok: false,
        message: "Serviço público indisponível. Valide o formato ou consulte a AGT.",
      };
    }
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && "valid" in payload) {
      const valid = Boolean((payload as { valid?: boolean }).valid);
      return {
        ok: valid,
        message: valid
          ? "Formato confirmado pela API pública (não substitui a AGT)."
          : "A API pública não reconheceu este número.",
      };
    }
    return {
      ok: true,
      message: "Consulta efectuada. Confirme sempre no Portal do Contribuinte.",
    };
  } catch {
    return {
      ok: false,
      message: "Sem ligação à API. Use o Portal AGT para confirmar o documento.",
    };
  }
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
