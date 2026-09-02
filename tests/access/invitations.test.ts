import { describe, expect, it } from "vitest";
import {
  createSchoolInvitationInputSchema,
  revokeSchoolInvitationInputSchema,
  acceptSchoolInvitationInputSchema,
} from "@/features/access/schemas";

describe("School Invitations Enterprise System", () => {
  describe("createSchoolInvitationInputSchema", () => {
    it("validates teacher invitation payload", () => {
      const valid = createSchoolInvitationInputSchema.parse({
        email: "docente.matematica@escola.ao",
        roleCode: "teacher",
        fullName: "Docente Matemática",
      });
      expect(valid.email).toBe("docente.matematica@escola.ao");
      expect(valid.roleCode).toBe("teacher");
      expect(valid.fullName).toBe("Docente Matemática");
    });

    it("defaults roleCode to teacher when omitted", () => {
      const valid = createSchoolInvitationInputSchema.parse({
        email: "novo.membro@escola.ao",
      });
      expect(valid.roleCode).toBe("teacher");
    });

    it("rejects invalid emails", () => {
      const invalid = createSchoolInvitationInputSchema.safeParse({
        email: "not-an-email",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("revokeSchoolInvitationInputSchema", () => {
    it("validates invitationId uuid", () => {
      const valid = revokeSchoolInvitationInputSchema.parse({
        invitationId: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(valid.invitationId).toBe("123e4567-e89b-12d3-a456-426614174000");
    });

    it("rejects non-uuid strings", () => {
      const invalid = revokeSchoolInvitationInputSchema.safeParse({
        invitationId: "invalid-id",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("acceptSchoolInvitationInputSchema", () => {
    it("validates rawToken string", () => {
      const valid = acceptSchoolInvitationInputSchema.parse({
        token: "abcdef1234567890abcdef1234567890",
      });
      expect(valid.token).toBe("abcdef1234567890abcdef1234567890");
    });

    it("rejects short tokens", () => {
      const invalid = acceptSchoolInvitationInputSchema.safeParse({
        token: "short",
      });
      expect(invalid.success).toBe(false);
    });
  });
});
