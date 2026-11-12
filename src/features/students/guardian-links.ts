/**
 * Vínculo aluno–encarregado com vigência (`valid_from`/`valid_until`).
 *
 * Remover um encarregado fecha a vigência em vez de apagar a linha: o histórico
 * de quem foi responsável pelo aluno fica, e as funções da base que decidem o
 * acesso do portal (`sg.valid_until is null`) deixam logo de o contar.
 *
 * A base tem um único registo por par aluno+pessoa: voltar a ligar a mesma
 * pessoa reabre esse registo; o período anterior fica na auditoria.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

type LinkRow = {
  id: string;
  is_primary: boolean;
  relationship: string;
  valid_from: string;
  valid_until: string | null;
};

export type GuardianLinkResult = {
  reopened: boolean;
  /** Período anterior do vínculo reaberto, para a auditoria. */
  previous: { validFrom: string; validUntil: string } | null;
};

async function findLink(
  db: AdminDb,
  input: { schoolId: string; studentId: string; guardianPersonId: string },
): Promise<LinkRow | null> {
  const { data, error } = await db
    .from("student_guardians")
    .select("id, is_primary, relationship, valid_from, valid_until")
    .eq("school_id", input.schoolId)
    .eq("student_id", input.studentId)
    .eq("guardian_person_id", input.guardianPersonId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível verificar o encarregado.");
  return (data as LinkRow | null) ?? null;
}

export async function linkGuardian(
  db: AdminDb,
  input: {
    schoolId: string;
    studentId: string;
    guardianPersonId: string;
    /** Já no vocabulário da base (`mapSgaGuardianRelationship`). */
    relationship: string;
    isPrimary: boolean;
    userId: string;
    today: string;
  },
): Promise<GuardianLinkResult> {
  const existing = await findLink(db, input);
  if (existing && existing.valid_until == null) {
    throw new Error("Esta pessoa já é encarregada deste aluno.");
  }

  if (input.isPrimary) {
    // Se falhar, o aluno ficava com dois encarregados principais.
    const { error: primaryError } = await db
      .from("student_guardians")
      .update({ is_primary: false })
      .eq("school_id", input.schoolId)
      .eq("student_id", input.studentId)
      .eq("is_primary", true);
    if (primaryError) {
      throw publicDatabaseError(primaryError, "Não foi possível trocar o encarregado principal.");
    }
  }

  if (existing) {
    // Só reabre se ninguém o reabriu entretanto (compare-and-swap na vigência).
    const { data, error } = await db
      .from("student_guardians")
      .update({
        relationship: input.relationship,
        is_primary: input.isPrimary,
        is_pickup_authorized: true,
        valid_from: input.today,
        valid_until: null,
      })
      .eq("id", existing.id)
      .eq("school_id", input.schoolId)
      .eq("valid_until", existing.valid_until as string)
      .select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível associar o encarregado.");
    if (!data?.length) throw new Error("Esta pessoa já é encarregada deste aluno.");
    return {
      reopened: true,
      previous: { validFrom: existing.valid_from, validUntil: existing.valid_until as string },
    };
  }

  // SGA: id PK, is_pickup_authorized, created_by NOT NULL; no updated_by / authorized_pickup.
  const { error } = await db.from("student_guardians").insert({
    school_id: input.schoolId,
    student_id: input.studentId,
    guardian_person_id: input.guardianPersonId,
    relationship: input.relationship,
    is_primary: input.isPrimary,
    is_pickup_authorized: true,
    created_by: input.userId,
  });
  if (error) throw publicDatabaseError(error, "Não foi possível associar o encarregado.");
  return { reopened: false, previous: null };
}

export type ClosedGuardianLink = {
  id: string;
  wasPrimary: boolean;
  relationship: string;
  validFrom: string;
  validUntil: string;
};

/** Fecha a vigência do vínculo activo. Não apaga: o histórico fica. */
export async function closeGuardianLink(
  db: AdminDb,
  input: { schoolId: string; studentId: string; guardianPersonId: string; today: string },
): Promise<ClosedGuardianLink> {
  const existing = await findLink(db, input);
  if (!existing || existing.valid_until != null) {
    throw new Error("Esta pessoa já não é encarregada deste aluno.");
  }
  // A base recusa valid_until < valid_from; um vínculo com início futuro fecha nesse dia.
  const validUntil = existing.valid_from > input.today ? existing.valid_from : input.today;
  const { data, error } = await db
    .from("student_guardians")
    // Um vínculo fechado não pode continuar a ser o principal.
    .update({ valid_until: validUntil, is_primary: false })
    .eq("id", existing.id)
    .eq("school_id", input.schoolId)
    .is("valid_until", null)
    .select("id");
  if (error) throw publicDatabaseError(error, "Não foi possível remover o encarregado.");
  if (!data?.length) throw new Error("Esta pessoa já não é encarregada deste aluno.");
  return {
    id: existing.id,
    wasPrimary: existing.is_primary,
    relationship: existing.relationship,
    validFrom: existing.valid_from,
    validUntil,
  };
}

/**
 * Antes de fundir duas fichas da mesma pessoa: se o duplicado é encarregado
 * vigente de um aluno a quem a ficha que fica já esteve ligada (vínculo
 * fechado), reabre o vínculo da ficha que fica. A fusão apaga a ligação
 * repetida do duplicado e, sem isto, o encarregado perdia o acesso.
 */
export async function reopenSurvivorGuardianLinks(
  db: AdminDb,
  input: { schoolId: string; survivorId: string; duplicateId: string; today: string },
): Promise<number> {
  const { data, error } = await db
    .from("student_guardians")
    .select("id, student_id, guardian_person_id, valid_until")
    .eq("school_id", input.schoolId)
    .in("guardian_person_id", [input.survivorId, input.duplicateId]);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os educandos.");
  const rows = (data ?? []) as Array<{
    id: string;
    student_id: string;
    guardian_person_id: string;
    valid_until: string | null;
  }>;
  const activeDuplicateWards = new Set(
    rows
      .filter((row) => row.guardian_person_id === input.duplicateId && row.valid_until == null)
      .map((row) => row.student_id),
  );
  const toReopen = rows
    .filter(
      (row) =>
        row.guardian_person_id === input.survivorId &&
        row.valid_until != null &&
        activeDuplicateWards.has(row.student_id),
    )
    .map((row) => row.id);
  if (!toReopen.length) return 0;
  const { error: reopenError } = await db
    .from("student_guardians")
    .update({ valid_from: input.today, valid_until: null })
    .eq("school_id", input.schoolId)
    .in("id", toReopen);
  if (reopenError)
    throw publicDatabaseError(reopenError, "Não foi possível transferir os educandos.");
  return toReopen.length;
}
