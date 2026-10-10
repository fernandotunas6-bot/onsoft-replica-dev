/**
 * Data da base em ISO UTC com microssegundos («…08:00:00.123456Z»). O PostgREST
 * devolve microssegundos; `Date` só guarda milissegundos, e um cursor com a
 * precisão cortada repetia ou saltava linhas criadas no mesmo milissegundo.
 */
export const isoMicros = (s: string) => {
  const utc = /\.(\d{1,6})(?:Z|\+00(?::?00)?)$/.exec(s);
  const base = new Date(s).toISOString();
  return base.replace(/\.\d{3}Z$/, `.${(utc?.[1] ?? base.slice(20, 23)).padEnd(6, "0")}Z`);
};
