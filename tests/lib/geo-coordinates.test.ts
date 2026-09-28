import { describe, expect, it } from "vitest";
import { formatGeoPoint, parseGeoPoint } from "@/lib/geo-coordinates";

describe("coordenadas GPS da escola", () => {
  it("lê o par copiado do mapa", () => {
    expect(parseGeoPoint("-12.7761, 15.7392")).toEqual({ latitude: -12.7761, longitude: 15.7392 });
    expect(parseGeoPoint("-8.8383 13.2344")).toEqual({ latitude: -8.8383, longitude: 13.2344 });
    expect(parseGeoPoint("  ")).toBeNull();
  });

  it("recusa texto e valores fora do globo", () => {
    for (const value of ["Huambo", "-12.7", "95, 10", "10, 190", "1,2,3"]) {
      expect(parseGeoPoint(value)).toBe("invalid");
    }
  });

  it("volta a escrever o par, ou vazio sem coordenadas", () => {
    expect(formatGeoPoint(-12.7761, 15.7392)).toBe("-12.7761, 15.7392");
    expect(formatGeoPoint(null, 15)).toBe("");
  });
});
