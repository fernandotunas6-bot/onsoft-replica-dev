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

export const resetStaffPasswordInputSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8),
});
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordInputSchema>;

export const createSchoolInvitationInputSchema = z.object({
  email: z.string().trim().email(),
  roleCode: z.string().trim().min(2).max(50).default("teacher"),
  fullName: z.string().trim().min(2).max(160).optional(),
});
export type CreateSchoolInvitationInput = z.infer<typeof createSchoolInvitationInputSchema>;

export const revokeSchoolInvitationInputSchema = z.object({
  invitationId: z.string().uuid(),
});
export type RevokeSchoolInvitationInput = z.infer<typeof revokeSchoolInvitationInputSchema>;

export const acceptSchoolInvitationInputSchema = z.object({
  token: z.string().trim().min(10).max(256),
});
export type AcceptSchoolInvitationInput = z.infer<typeof acceptSchoolInvitationInputSchema>;

