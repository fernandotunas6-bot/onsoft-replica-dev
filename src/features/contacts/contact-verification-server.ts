import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ContactVerificationService,
  type ContactChannel,
  type ContactVerificationProfile,
  type CommunicationPreferences,
} from "./contact-verification-service";

/**
 * Schema de validação para atualização de preferências de comunicação.
 */
export const updateCommunicationPreferencesSchema = z.object({
  academic: z.boolean().optional(),
  financial: z.boolean().optional(),
  attendance: z.boolean().optional(),
  calendar: z.boolean().optional(),
  announcements: z.boolean().optional(),
  events: z.boolean().optional(),
  documents: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

export type UpdateCommunicationPreferencesInput = z.infer<
  typeof updateCommunicationPreferencesSchema
>;

/**
 * getContactVerificationProfileFn — Obtém o perfil de verificação do utilizador atual.
 */
export const getContactVerificationProfileFn = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContactVerificationProfile> => {
    if (!context) throw new Error("Unauthorized");

    return ContactVerificationService.getOrCreateProfile(context.userId);
  });

/**
 * getCommunicationPreferencesFn — Obtém as preferências de comunicação do utilizador.
 */
export const getCommunicationPreferencesFn = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<CommunicationPreferences> => {
      if (!context) throw new Error("Unauthorized");

      return ContactVerificationService.getOrCreateCommunicationPreferences(
        context.userId,
      );
    },
  );

/**
 * setPreferredCommunicationChannelFn — Define o canal de comunicação preferido.
 */
export const setPreferredCommunicationChannelFn = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        channel: z.enum(["email", "sms", "whatsapp"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");

    await ContactVerificationService.setPreferredChannel(
      context.userId,
      data.channel as ContactChannel,
    );

    return { success: true };
  });

/**
 * updateCommunicationPreferencesFn — Atualiza as preferências de categorias.
 */
export const updateCommunicationPreferencesFn = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateCommunicationPreferencesSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");

    await ContactVerificationService.updateCommunicationCategories(
      context.userId,
      {
        academic: data.academic,
        financial: data.financial,
        attendance: data.attendance,
        calendar: data.calendar,
        announcements: data.announcements,
        events: data.events,
        documents: data.documents,
        marketing: data.marketing,
      },
    );

    return { success: true };
  });
