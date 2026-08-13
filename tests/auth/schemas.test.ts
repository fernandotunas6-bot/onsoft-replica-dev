import { describe, expect, it } from "vitest";
import {
  setCurrentProfileAvatarInputSchema,
  updateCurrentProfileInputSchema,
} from "@/features/auth/schemas";
import { isManagedProfileAvatarUrl } from "@/features/auth/profile-avatar-url";

describe("updateCurrentProfileInputSchema", () => {
  it("aceita telefone angolano opcional", () => {
    expect(
      updateCurrentProfileInputSchema.parse({
        fullName: "Ana Costa",
        phone: "+244923456789",
        expectedUpdatedAt: new Date().toISOString(),
      }).phone,
    ).toBe("+244923456789");
  });

  it("rejeita telefone inválido", () => {
    expect(() =>
      updateCurrentProfileInputSchema.parse({
        fullName: "Ana Costa",
        phone: "123",
        expectedUpdatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("aceita o formato timestamptz real do PostgREST (offset +00:00, não Z)", () => {
    expect(() =>
      updateCurrentProfileInputSchema.parse({
        fullName: "Ana Costa",
        expectedUpdatedAt: "2026-08-13T13:45:00+00:00",
      }),
    ).not.toThrow();
  });
});

describe("profile avatars", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  it("accepts only an avatar path owned by a UUID", () => {
    expect(
      setCurrentProfileAvatarInputSchema.safeParse({
        storagePath: `${userId}/avatar-1786600000000.webp`,
      }).success,
    ).toBe(true);
    expect(
      setCurrentProfileAvatarInputSchema.safeParse({
        storagePath: `${userId}/documento.pdf`,
      }).success,
    ).toBe(false);
  });

  it("recognises private references and legacy Supabase public URLs", () => {
    expect(isManagedProfileAvatarUrl(`siga-avatar://${userId}/avatar-1786600000000.png`)).toBe(
      true,
    );
    expect(
      isManagedProfileAvatarUrl(
        `https://project.supabase.co/storage/v1/object/public/avatars/${userId}/avatar-1786600000000.jpg`,
      ),
    ).toBe(true);
    expect(isManagedProfileAvatarUrl("https://example.com/photo.jpg")).toBe(false);
  });
});
