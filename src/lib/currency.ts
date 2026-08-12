export const kwanza = (value: number) =>
  new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace("AOA", "Kz");
