/**
 * Coordenadas GPS escritas como "latitude, longitude" (por exemplo, copiadas do
 * Google Maps: "-12.7761, 15.7392"). Devolve null se o texto estiver vazio e
 * "invalid" se não for um par válido.
 */
export type GeoPoint = { latitude: number; longitude: number };

export function parseGeoPoint(text: string): GeoPoint | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(trimmed);
  if (!match) return "invalid";
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return "invalid";
  return { latitude, longitude };
}

export function formatGeoPoint(latitude: unknown, longitude: unknown): string {
  if (latitude == null || longitude == null || latitude === "" || longitude === "") return "";
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat}, ${lng}`;
}
