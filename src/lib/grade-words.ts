/**
 * Notas por extenso (0–20 valores, uma casa decimal), como nos certificados:
 * «14 (catorze) valores», «13,5 (treze vírgula cinco) valores».
 */
const UNITS = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezasseis",
  "dezassete",
  "dezoito",
  "dezanove",
  "vinte",
];

export function gradeInWords(value: number) {
  const rounded = Math.round(Math.min(20, Math.max(0, value)) * 10) / 10;
  const whole = Math.trunc(rounded);
  const tenth = Math.round((rounded - whole) * 10);
  const words = tenth ? `${UNITS[whole]} vírgula ${UNITS[tenth]}` : UNITS[whole]!;
  const digits = tenth ? `${whole},${tenth}` : String(whole);
  return { digits, words, text: `${digits} (${words}) valores` };
}
