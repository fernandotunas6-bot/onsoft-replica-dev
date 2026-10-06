import type { TablesUpdate } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findBestPersonMatch, type DuplicateMatch } from "../engine/dedupe";
import {
  normalizeDate,
  normalizeGender,
  normalizePhoneDigits,
  normalizeText,
} from "../engine/normalize";
import type { AuditEntry, ImportCommitContext } from "../engine/types";
import { normalizePersonNif } from "@/lib/angola-identity";
import { selectAllPages } from "../engine/paged";

export type PersonCandidate = {
  full_name: string;
  national_id?: string | null;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  gender?: string | null;
};

export type ExistingPersonRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  national_id: string | null;
  date_of_birth: string | null;
  status: string;
};

/** Uma consulta por job, reutilizada por todas as linhas — evita 1 query por linha. */
export async function loadExistingPeople(
  db: SupabaseClient,
  schoolId: string,
): Promise<ExistingPersonRow[]> {
  // Todas, em páginas: com o tecto antigo de 2000, uma escola maior deixava de
  // reconhecer as pessoas já registadas e criava-as outra vez.
  return selectAllPages<ExistingPersonRow>(
    (from, to) =>
      db
        .from("people")
        .select("id, full_name, email, phone, national_id, date_of_birth, status")
        .eq("school_id", schoolId)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: ExistingPersonRow[] | null;
        error: { message: string } | null;
      }>,
    "Não foi possível carregar pessoas existentes",
  );
}

export function personCandidateFromRow(row: Record<string, unknown>): PersonCandidate | null {
  const fullName = normalizeText(
    row["full_name"] ?? row["nome"] ?? row["Nome"] ?? row["nome_completo"],
  );
  if (!fullName) return null;
  const idRaw = normalizeText(
    row["national_id"] ?? row["id_number"] ?? row["bi"] ?? row["BI"] ?? row["cedula"],
  );
  return {
    full_name: fullName,
    national_id: idRaw ? (normalizePersonNif(idRaw) ?? idRaw) : null,
    email: normalizeText(row["email"] ?? row["e-mail"] ?? row["E-mail"]) || null,
    phone: normalizePhoneDigits(row["phone"] ?? row["telefone"] ?? row["Telefone"]),
    birth_date: normalizeDate(
      row["birth_date"] ?? row["data_nascimento"] ?? row["Data de Nascimento"],
    ),
    gender: normalizeGender(row["gender"] ?? row["genero"] ?? row["Gênero"] ?? row["sexo"]),
  };
}

/**
 * Resolve uma pessoa: encontra correspondência (mesmos pesos de
 * findPersonDuplicates) e decide criar/actualizar/ignorar conforme a
 * estratégia do job. Partilhado por todos os importadores baseados em
 * pessoas (pessoas, alunos, professores, encarregados).
 */
export async function resolveOrCreatePerson(
  candidate: PersonCandidate,
  existingPeople: ExistingPersonRow[],
  ctx: ImportCommitContext,
): Promise<{
  personId: string;
  created: boolean;
  match: DuplicateMatch<ExistingPersonRow> | null;
  audits: AuditEntry[];
}> {
  const match = findBestPersonMatch(candidate, existingPeople);

  if (match && ctx.duplicateStrategy !== "create_new") {
    if (ctx.duplicateStrategy === "ignore") {
      return { personId: match.record.id, created: false, match, audits: [] };
    }
    // "update": completa campos vazios na ficha existente, nunca apaga dados já preenchidos.
    const patch: Record<string, unknown> = {};
    if (candidate.email && !match.record.email) patch["email"] = candidate.email;
    if (candidate.phone && !match.record.phone) patch["phone"] = candidate.phone;
    if (candidate.national_id && !match.record.national_id) {
      patch["national_id"] = candidate.national_id;
    }
    if (candidate.birth_date && !match.record.date_of_birth) {
      patch["birth_date"] = candidate.birth_date;
    }
    if (Object.keys(patch).length === 0) {
      return { personId: match.record.id, created: false, match, audits: [] };
    }
    if (ctx.dryRun) {
      return { personId: match.record.id, created: false, match, audits: [] };
    }
    const dbPatch: TablesUpdate<"people"> = { updated_by: ctx.userId };
    if ("email" in patch) dbPatch["email"] = patch["email"] as string | null;
    if ("phone" in patch) dbPatch["phone"] = patch["phone"] as string | null;
    if ("national_id" in patch) dbPatch["national_id"] = patch["national_id"] as string | null;
    if ("birth_date" in patch) dbPatch["date_of_birth"] = patch["birth_date"] as string | null;
    const { error } = await ctx.db.from("people").update(dbPatch).eq("id", match.record.id);
    if (error) throw new Error(`Não foi possível actualizar a pessoa existente: ${error.message}`);
    return {
      personId: match.record.id,
      created: false,
      match,
      audits: [
        {
          table_name: "people",
          target_id: match.record.id,
          action_type: "updated",
          before_data: match.record,
          after_data: { ...match.record, ...dbPatch },
        },
      ],
    };
  }

  if (ctx.dryRun) {
    return { personId: "dry-run", created: true, match, audits: [] };
  }

  const { data: created, error } = await ctx.db
    .from("people")
    .insert({
      school_id: ctx.schoolId,
      full_name: candidate.full_name,
      preferred_name: candidate.full_name.split(/\s+/)[0],
      email: candidate.email || null,
      phone: candidate.phone || null,
      national_id: candidate.national_id || null,
      date_of_birth: candidate.birth_date || null,
      sex: candidate.gender || null,
      status: "active",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Não foi possível criar a pessoa: ${error.message}`);

  const newPersonRow: ExistingPersonRow = {
    id: created.id as string,
    full_name: candidate.full_name,
    email: candidate.email || null,
    phone: candidate.phone || null,
    national_id: candidate.national_id || null,
    date_of_birth: candidate.birth_date || null,
    status: "active",
  };
  existingPeople.push(newPersonRow);

  return {
    personId: created.id as string,
    created: true,
    match,
    audits: [
      {
        table_name: "people",
        target_id: created.id as string,
        action_type: "inserted",
        after_data: candidate,
      },
    ],
  };
}
