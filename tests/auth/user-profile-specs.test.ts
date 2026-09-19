import { describe, expect, it } from "vitest";
import {
  updateCurrentProfileInputSchema,
  setCurrentProfileAvatarInputSchema,
} from "@/features/auth/schemas";
import { normalizeAngolaPhone, validateAngolaPhone } from "@/lib/angola-phone";
import { isManagedProfileAvatarUrl } from "@/features/auth/profile-avatar-url";

describe("User Profile & Multi-School Membership Specification", () => {
  describe("Angola Phone Normalization & Validation Spec", () => {
    it("validates valid Angolan operator numbers (Unitel, Africell, Movicel)", () => {
      const validNumbers = [
        "+244923456789",
        "+244 912 345 678",
        "923 456 789",
        "931234567",
        "945678901",
        "951234567",
        "991234567",
      ];
      for (const num of validNumbers) {
        const check = validateAngolaPhone(num);
        expect(check.ok, `Failed for ${num}`).toBe(true);
        const normalized = normalizeAngolaPhone(num);
        expect(normalized).toMatch(/^\+2449[1-9]\d{7}$/);
      }
    });

    it("rejects invalid phone numbers", () => {
      const invalidNumbers = [
        "123456789",
        "+351912345678",
        "+244812345678", // Invalid prefix 8
        "923456", // Too short
        "92345678901", // Too long
        "short",
      ];
      for (const num of invalidNumbers) {
        const check = validateAngolaPhone(num);
        expect(check.ok, `Expected failure for ${num}`).toBe(false);
      }
    });
  });

  describe("Profile Schema Spec", () => {
    it("validates full profile payload with first and last name", () => {
      const payload = {
        fullName: "Fernando Afonso Tunas",
        firstName: "Fernando",
        lastName: "Tunas",
        phone: "+244923456789",
        expectedUpdatedAt: "2026-08-30T19:00:00+00:00",
      };
      const parsed = updateCurrentProfileInputSchema.parse(payload);
      expect(parsed.fullName).toBe("Fernando Afonso Tunas");
      expect(parsed.firstName).toBe("Fernando");
      expect(parsed.lastName).toBe("Tunas");
      expect(parsed.phone).toBe("+244923456789");
    });

    it("requires at least 2 characters for full name", () => {
      expect(() =>
        updateCurrentProfileInputSchema.parse({
          fullName: "A",
          expectedUpdatedAt: new Date().toISOString(),
        }),
      ).toThrow();
    });

    it("requires expectedUpdatedAt to prevent concurrency conflicts", () => {
      expect(() =>
        updateCurrentProfileInputSchema.parse({
          fullName: "Maria Silva",
        } as unknown as Record<string, unknown>),
      ).toThrow();
    });
  });

  describe("Avatar Storage Path Spec", () => {
    const userUuid = "d3b07384-d113-4603-9c8e-a2f0714b2201";

    it("accepts canonical private avatar path pattern", () => {
      const validPath = `${userUuid}/avatar-1786600000000.webp`;
      const result = setCurrentProfileAvatarInputSchema.safeParse({
        storagePath: validPath,
      });
      expect(result.success).toBe(true);
    });

    it("rejects avatar path belonging to another directory or non-image", () => {
      expect(
        setCurrentProfileAvatarInputSchema.safeParse({
          storagePath: `other-user/avatar.webp`,
        }).success,
      ).toBe(false);

      expect(
        setCurrentProfileAvatarInputSchema.safeParse({
          storagePath: `${userUuid}/doc.pdf`,
        }).success,
      ).toBe(false);
    });

    it("identifies managed profile avatar URLs correctly", () => {
      expect(isManagedProfileAvatarUrl(`siga-avatar://${userUuid}/avatar-1786600000000.webp`)).toBe(
        true,
      );
      expect(
        isManagedProfileAvatarUrl(
          `https://xodgfmxiaunpamctfeea.supabase.co/storage/v1/object/public/avatars/${userUuid}/avatar-1786600000000.png`,
        ),
      ).toBe(true);
      expect(isManagedProfileAvatarUrl("https://external-cdn.com/avatar.jpg")).toBe(false);
    });
  });
});
