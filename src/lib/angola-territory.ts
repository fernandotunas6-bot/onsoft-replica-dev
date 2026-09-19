export const angolaProvinces = [
  "Bengo",
  "Benguela",
  "Bié",
  "Cabinda",
  "Cuando",
  "Cuanza Norte",
  "Cuanza Sul",
  "Cubango",
  "Cunene",
  "Huambo",
  "Huíla",
  "Icolo e Bengo",
  "Luanda",
  "Lunda Norte",
  "Lunda Sul",
  "Malanje",
  "Moxico",
  "Moxico Leste",
  "Namibe",
  "Uíge",
  "Zaire",
] as const;

export type AngolaProvince = (typeof angolaProvinces)[number];

export function normalizeAngolaProvince(value?: string | null): AngolaProvince | null {
  const input = value?.trim();
  if (!input) return null;

  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-AO");

  return (
    angolaProvinces.find(
      (province) =>
        province
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("pt-AO") === normalized,
    ) ?? null
  );
}
