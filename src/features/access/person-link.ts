/**
 * Ligar uma conta à ficha (`people.user_id`) da escola pelo e-mail.
 *
 * Uma só regra para quem cria a conta em Acessos (`inviteSystemUser`) e para
 * quem aceita um convite (`acceptSchoolInvitation`):
 *
 * - o e-mail compara-se inteiro, sem olhar a maiúsculas nem espaços. Em ILIKE,
 *   «_» e «%» são curingas: «ana_silva@…» apanhava «ana.silva@…», por isso
 *   escapam-se e confirma-se o resultado;
 * - só se liga quando há exactamente uma ficha sem conta com esse e-mail;
 * - nunca se troca a conta de uma ficha já ligada a outra pessoa.
 *
 * Antes, a criação em Acessos comparava o e-mail à letra (uma ficha com
 * «Ana@Escola.ao» nunca ficava ligada), e trocava sem aviso a conta de uma
 * ficha já ligada. A Prontidão do Mobile (`/configuracoes/mobile`) segue estas
 * mesmas regras para dizer quem está pronto a convidar.
 */
type Db = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type PersonLinkResult =
  /** A ficha ficou (ou já estava) ligada a esta conta. */
  | "linked"
  /** Nenhuma ficha da escola tem este e-mail. */
  | "no-record"
  /** Mais de uma ficha sem conta com este e-mail: não se adivinha qual. */
  | "ambiguous"
  /** A ficha com este e-mail já está ligada a outra conta. */
  | "taken";

const normal = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

export async function linkPersonByEmail(
  db: Db,
  schoolId: string,
  email: string,
  userId: string,
): Promise<PersonLinkResult> {
  const wanted = normal(email);
  if (!wanted) return "no-record";
  const { data, error } = await db
    .from("people")
    .select("id, email, user_id")
    .eq("school_id", schoolId)
    // Os «%» das pontas apanham espaços guardados à volta do e-mail; a
    // comparação exacta abaixo decide.
    .ilike("email", `%${wanted.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    .is("deleted_at", null)
    .limit(50);
  if (error) throw new Error("Não foi possível procurar a ficha com este e-mail.");
  const rows = (
    (data ?? []) as { id: string; email: string | null; user_id: string | null }[]
  ).filter((row) => normal(row.email) === wanted);
  if (rows.some((row) => row.user_id === userId)) return "linked";
  const free = rows.filter((row) => !row.user_id);
  if (free.length > 1) return "ambiguous";
  if (!free.length) return rows.length ? "taken" : "no-record";
  const { data: updated, error: updateError } = await db
    .from("people")
    .update({ user_id: userId })
    .eq("school_id", schoolId)
    .eq("id", free[0]!.id)
    .is("user_id", null)
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error("Não foi possível ligar a conta à ficha.");
  // Outra conta ligou-se entretanto à mesma ficha.
  return updated ? "linked" : "taken";
}

/** Aviso para quem criou a conta, quando a ficha não ficou ligada. */
export function personLinkWarning(result: PersonLinkResult, cargo: string): string | null {
  if (result === "linked" || !["Aluno", "Professor", "Encarregado"].includes(cargo)) return null;
  const why =
    result === "no-record"
      ? "nenhuma ficha da escola tem este e-mail"
      : result === "ambiguous"
        ? "há mais de uma ficha com este e-mail"
        : "a ficha com este e-mail já está ligada a outra conta";
  return `A conta foi criada, mas não ficou ligada a uma ficha: ${why}. Corrija o e-mail na ficha e veja Definições → Prontidão do Mobile.`;
}
