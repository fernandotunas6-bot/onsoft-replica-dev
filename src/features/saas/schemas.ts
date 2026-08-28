import { z } from "zod";

export const planCodeSchema = z.enum(["start", "professional", "business", "enterprise"]);

export const createSchoolWizardInputSchema = z.object({
  name: z.string().trim().min(2, "Nome da escola obrigatório"),
  commercial_name: z.string().trim().optional(),
  nif: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("E-mail da escola inválido").optional().or(z.literal("")),
  logo_url: z.string().trim().optional(),

  contact_name: z.string().trim().min(2, "Nome do responsável obrigatório"),
  contact_role: z.string().trim().optional(),
  contact_phone: z.string().trim().optional(),
  contact_email: z.string().trim().email("E-mail do responsável inválido"),

  plan_code: planCodeSchema,
  trial_days: z.number().int().min(0).max(90).default(14),

  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Subdomínio deve ter pelo menos 3 caracteres")
    .regex(/^[a-z0-9-]+$/, "Subdomínio só pode ter letras minúsculas, números e hífen"),

  admin_email: z.string().trim().email("E-mail do administrador inválido"),
  admin_name: z.string().trim().min(2, "Nome do administrador obrigatório"),
});

export type CreateSchoolWizardInput = z.infer<typeof createSchoolWizardInputSchema>;

export const updateTenantStatusInputSchema = z.object({
  tenantId: z.string().uuid(),
  status: z.enum([
    "provisioning",
    "provisioning_failed",
    "trial",
    "active",
    "past_due",
    "suspended",
    "cancelled",
    "archived",
  ]),
});

export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusInputSchema>;

export const tenantSlugInputSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1),
});

export type TenantSlugInput = z.infer<typeof tenantSlugInputSchema>;

/**
 * Signup público (landing, sem sessão) — mesmos campos do wizard interno,
 * menos `trial_days` (fixo no servidor, nunca decidido pelo cliente, para
 * não dar a quem preenche o formulário controlo sobre a duração do trial).
 * `website` é um honeypot: campo escondido no formulário que só um bot
 * preenche; se vier com valor, o pedido é rejeitado na validação.
 */
export const publicSchoolSignupInputSchema = createSchoolWizardInputSchema
  .omit({ trial_days: true })
  .extend({
    website: z.string().max(0, "Pedido inválido.").optional().or(z.literal("")),
  });

export type PublicSchoolSignupInput = z.infer<typeof publicSchoolSignupInputSchema>;
