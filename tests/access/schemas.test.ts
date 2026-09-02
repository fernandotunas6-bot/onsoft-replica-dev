import { describe, expect, it } from "vitest";
import { resendSystemInviteInputSchema } from "@/features/access/schemas";

describe("resendSystemInviteInputSchema", () => {
  it("exige o id do utilizador", () => {
    expect(resendSystemInviteInputSchema.safeParse({}).success).toBe(false);
    expect(
      resendSystemInviteInputSchema.parse({ userId: "11111111-1111-1111-1111-111111111111" })
        .userId,
    ).toHaveLength(36);
  });
});

describe("School Invitation Schemas", () => {
  it("validates createSchoolInvitationInputSchema", async () => {
    const { createSchoolInvitationInputSchema } = await import("@/features/access/schemas");
    expect(createSchoolInvitationInputSchema.safeParse({ email: "invalid" }).success).toBe(false);
    const parsed = createSchoolInvitationInputSchema.parse({
      email: "professor@escola.ao",
      roleCode: "teacher",
    });
    expect(parsed.email).toBe("professor@escola.ao");
    expect(parsed.roleCode).toBe("teacher");
  });

  it("validates revokeSchoolInvitationInputSchema", async () => {
    const { revokeSchoolInvitationInputSchema } = await import("@/features/access/schemas");
    expect(revokeSchoolInvitationInputSchema.safeParse({}).success).toBe(false);
    expect(
      revokeSchoolInvitationInputSchema.parse({
        invitationId: "22222222-2222-2222-2222-222222222222",
      }).invitationId,
    ).toHaveLength(36);
  });
});

