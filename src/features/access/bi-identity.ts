/**
 * Um BI/telefone pode aparecer em pessoas de várias escolas. A identidade de
 * autenticação é a ligação explícita a auth.users, não people.email (que a
 * Secretaria pode editar). Diferentes user_id = ambíguo = negar resolução.
 */
export function pickUnambiguousLinkedAuthUserId(
  rows: readonly { user_id: string | null }[] | null | undefined,
): string | null {
  if (!rows?.length) return null;
  const linked = new Set(
    rows.map((row) => row.user_id?.trim()).filter((value): value is string => Boolean(value)),
  );
  return linked.size === 1 ? [...linked][0]! : null;
}
