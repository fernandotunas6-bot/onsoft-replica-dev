/**
 * Trimestres do ano lectivo no formulário "Configurar trimestres" (/calendario).
 *
 * A 29/09 só 2 dos 51 anos lectivos em produção tinham trimestres: não havia ecrã para
 * `saveAcademicCalendar`, e os períodos criavam-se um a um. Sem trimestres não há
 * pautas, notas por período nem fecho de trimestre.
 */

export type TermDraft = { sequence: 1 | 2 | 3; name: string; startsOn: string; endsOn: string };

const DAY = 86_400_000;

function toDate(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`);
}

function toIso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Divide o ano em três blocos seguidos e sem sobreposição. É só uma sugestão para
 * preencher o formulário: a escola corrige as datas reais (pausas, exames) antes de gravar.
 */
export function suggestTerms(yearStartsOn: string, yearEndsOn: string): TermDraft[] {
  const start = toDate(yearStartsOn);
  const end = toDate(yearEndsOn);
  const days = Math.max(2, Math.round((end - start) / DAY));
  const cut1 = start + Math.floor(days / 3) * DAY;
  const cut2 = start + Math.floor((2 * days) / 3) * DAY;
  return [
    { sequence: 1, name: "1º Trimestre", startsOn: toIso(start), endsOn: toIso(cut1) },
    { sequence: 2, name: "2º Trimestre", startsOn: toIso(cut1 + DAY), endsOn: toIso(cut2) },
    { sequence: 3, name: "3º Trimestre", startsOn: toIso(cut2 + DAY), endsOn: toIso(end) },
  ];
}

/** Os trimestres gravados, completados pela sugestão onde faltam. */
export function termDrafts(
  year: { startsOn: string; endsOn: string },
  saved: Array<{ sequence: number; name: string; startsOn: string; endsOn: string }>,
): TermDraft[] {
  const suggested = suggestTerms(year.startsOn, year.endsOn);
  return suggested.map((term) => {
    const existing = saved.find((row) => row.sequence === term.sequence);
    return existing
      ? {
          sequence: term.sequence,
          name: existing.name,
          startsOn: existing.startsOn,
          endsOn: existing.endsOn,
        }
      : term;
  });
}
