import { z } from "zod";
import { applicationRoles } from "@/features/auth/access-policy";

export const inviteUserInputSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  cargo: z.enum(applicationRoles),
});
export type InviteUserInput = z.infer<typeof inviteUserInputSchema>;

export const updateAccountCargoInputSchema = z.object({
  userId: z.string().uuid(),
  cargo: z.enum(applicationRoles),
});
export type UpdateAccountCargoInput = z.infer<typeof updateAccountCargoInputSchema>;

export const setAccountDisabledInputSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
});
export type SetAccountDisabledInput = z.infer<typeof setAccountDisabledInputSchema>;

export const resendSystemInviteInputSchema = z.object({
  userId: z.string().uuid(),
});
export type ResendSystemInviteInput = z.infer<typeof resendSystemInviteInputSchema>;
