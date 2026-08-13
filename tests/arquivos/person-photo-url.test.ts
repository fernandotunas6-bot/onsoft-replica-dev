import { describe, expect, it } from "vitest";
import { isPrivatePersonPhotoUrl } from "@/features/arquivos/person-photo-url";

describe("person photo URLs", () => {
  it("recognises only the private SIGA file reference format", () => {
    expect(isPrivatePersonPhotoUrl("siga-file://11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isPrivatePersonPhotoUrl("siga-file://not-a-file")).toBe(false);
    expect(isPrivatePersonPhotoUrl("https://example.com/photo.jpg")).toBe(false);
  });
});
