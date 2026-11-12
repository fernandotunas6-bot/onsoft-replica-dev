/**
 * Campos de uma ficha de pessoa, como a base os guarda (auditoria 14).
 *
 * «Nova pessoa», «Nova matrícula» e «Aceitar candidatura» montavam cada um a sua
 * linha de `people`, com regras que já tinham divergido: só a candidatura
 * normalizava o BI, o telefone do encarregado ia sem normalizar, e o género
 * «Outro» seguia como `"outro"` — que `people_sex_check` recusa (aceita `male`,
 * `female`, `other` e `undisclosed`), por isso escolher «Outro» fazia falhar a
 * gravação nos três ecrãs. Há uma só montagem e uma só tradução do género.
 */
import type { TablesInsert } from "@/integrations/supabase/types";
import { normalizeStoredPhone } from "@/lib/angola-phone";
import { normalizePersonNif } from "@/lib/angola-identity";

export type StoredSex = "male" | "female" | "other";

/** Género do formulário («M», «F», «outro») ou de um ficheiro, no valor da base. */
export function toStoredSex(value: string | null | undefined): StoredSex | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "m":
    case "male":
    case "masculino":
      return "male";
    case "f":
    case "female":
    case "feminino":
      return "female";
    case "outro":
    case "other":
      return "other";
    default:
      return null;
  }
}

/** Inicial usada nas pautas e listas oficiais (M/F); vazio quando não se sabe. */
export function sexInitial(stored: string | null | undefined): "M" | "F" | "" {
  const sex = toStoredSex(stored);
  if (sex === "male") return "M";
  if (sex === "female") return "F";
  return "";
}

/** Rótulo para o ecrã. */
export function sexLabel(stored: string | null | undefined): string {
  const sex = toStoredSex(stored);
  if (sex === "male") return "Masculino";
  if (sex === "female") return "Feminino";
  if (sex === "other") return "Outro";
  return "—";
}

/** A base ainda não tem as colunas de morada de `people` (migração por aplicar). */
export function isMissingPeopleGeography(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  return Boolean(
    error &&
    (/province|municipality|commune|address|42703|schema cache/i.test(error.message ?? "") ||
      error.code === "42703"),
  );
}

export type PersonFieldsInput = {
  full_name: string;
  preferred_name?: string | undefined;
  first_name?: string | undefined;
  email?: string | undefined;
  phone_primary?: string | undefined;
  nif?: string | undefined;
  birth_date?: string | undefined;
  sex?: string | undefined;
  province?: string | undefined;
  municipality?: string | undefined;
  commune?: string | undefined;
  address?: string | undefined;
};

/** Telefone para gravar; um valor que não se normaliza segue tal como está, para a base dizer porquê. */
export function storedPhone(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  return normalizeStoredPhone(text) ?? text;
}

/**
 * Linha de `people` a inserir. A morada só entra quando vem preenchida: uma base
 * sem as colunas de morada continua a aceitar as fichas que não a trazem.
 */
export function buildPersonInsert(
  input: PersonFieldsInput,
  ctx: { schoolId: string; userId: string },
): { payload: TablesInsert<"people">; hasGeography: boolean; nationalId: string | null } {
  const fullName = input.full_name.trim();
  const nationalId = normalizePersonNif(input.nif);
  const payload: TablesInsert<"people"> = {
    school_id: ctx.schoolId,
    full_name: fullName,
    preferred_name:
      input.preferred_name?.trim() || input.first_name?.trim() || fullName.split(/\s+/)[0],
    email: input.email?.trim() || null,
    phone: storedPhone(input.phone_primary),
    national_id: nationalId,
    date_of_birth: input.birth_date || null,
    sex: toStoredSex(input.sex),
    status: "active",
    created_by: ctx.userId,
    updated_by: ctx.userId,
  };
  const hasGeography = Boolean(
    input.province || input.municipality || input.commune || input.address,
  );
  if (hasGeography) {
    payload["province"] = input.province || null;
    payload["municipality"] = input.municipality || null;
    payload["commune"] = input.commune || null;
    payload["address"] = input.address || null;
  }
  return { payload, hasGeography, nationalId };
}
