const DEFAULT_LOCALE = "pt-AO";
const DEFAULT_CURRENCY = "AOA";

export function formatCurrency(
  amountMinor: number,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "AOA" ? 0 : 2,
  }).format(amountMinor / 100);
}

export function formatCompactCurrency(
  amountMinor: number,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
}

export function formatPercentage(value: number, locale = DEFAULT_LOCALE) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}
