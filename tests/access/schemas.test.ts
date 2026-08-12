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
