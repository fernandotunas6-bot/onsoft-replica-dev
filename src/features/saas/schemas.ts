import { z } from "zod";
import { isReservedSubdomain } from "@/lib/saas/platform-domain";
import { validateSchoolNif } from "@/lib/angola-identity";
import { validateAngolaPhone } from "@/lib/angola-phone";

/**
 * Telefone angolano, quando preenchido.
 *
 * `validateAngolaPhone` já é usada na matrícula, na autenticação e no módulo de
 * pessoas. O registo de escola aceitava `z.string().optional()` — qualquer
 * texto passava. Aqui o campo continua opcional, mas deixa de aceitar lixo.
 */
/**
 * E-mail normalizado para minúsculas.
 *
 * O `.email()` do Zod é estrito o suficiente — recusa `a@b`, `x@y.z` e pontos
 * duplos — mas aceita maiúsculas. `createSchoolAdminAccount` já faz
 * `toLowerCase()` antes de criar a conta, portanto sem isto o que fica guardado
 * em `schools.email` e `tenants.contact_email` podia divergir do que serve para
 * entrar. Em produção ainda não divergiu (verificado: 0 casos); isto é para não
 * começar.
 */
const normalizedEmail = (message: string) => z.string().trim().toLowerCase().email(message);

const optionalAngolaPhone = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || validateAngolaPhone(value).ok, {
    message: "Telefone inválido. Use +244 9XX XXX XXX.",
  });

/**
 * Senha do administrador da escola.
 *
 * Esta conta manda numa instituição inteira — notas, moradas e telefones de
 * menores, e o financeiro das famílias. O mínimo anterior eram 8 caracteres sem
 * mais nenhuma regra, o que aceitava "12345678" e "password".
 *
 * As regras são deliberadamente poucas e verificáveis: comprimento a sério,
 * mais de um tipo de caracter, e recusa dos padrões triviais. Não impõe
 * símbolos obrigatórios — isso empurra as pessoas para "Password1!" e para o
 * post-it — mas impede o que é indefensável.
 */
const adminPasswordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .max(200, "A senha é demasiado longa.")
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), {
    message: "A senha deve combinar letras e números.",
  })
  .refine((value) => !/^(.)\1+$/.test(value), {
    message: "A senha não pode ser o mesmo caracter repetido.",
  })
  .refine((value) => !/^\d+$/.test(value.trim()), {
    message: "A senha não pode ser só dígitos.",
  })
  .refine(
    (value) => {
      // Comparação pelo valor inteiro, não por prefixo: "senha-forte-123" é uma
      // senha legítima que só por acaso começa pela palavra "senha". A primeira
      // versão desta regra rejeitava-a — apanhada pelos testes que já existiam.
      const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const trivial = new Set([
        "password",
        "passw0rd",
        "senha",
        "senhasenha",
        "qwerty",
        "qwertyuiop",
        "abc123",
        "abcd1234",
        "admin123",
        "escola123",
        "1234567890",
      ]);
      return !trivial.has(normalized);
    },
    { message: "Esta senha é demasiado comum. Escolha outra." },
  );

export const planCodeSchema = z.enum(["start", "professional", "business", "enterprise"]);

export const createSchoolWizardInputSchema = z.object({
  name: z.string().trim().min(2, "Nome da escola obrigatório"),
  commercial_name: z.string().trim().optional(),
  // Obrigatório: sem NIF a escola não consegue exportar SAF-T para a AGT
  // (`validateSaftSchoolReadiness` bloqueia), nem emitir documento fiscal
  // válido. Era opcional, e 85 das 87 escolas em produção ficaram sem ele —
  // só o descobririam na altura de declarar.
  //
  // A validação usada é `validateSchoolNif`, a mesma de que a exportação SAF-T
  // depende — não uma regra nova só para aqui. Aceita o NIF de entidade da AGT
  // (9–10 dígitos) e, por herança, o formato alfanumérico curto que escolas
  // antigas têm gravado; a mensagem diz as duas coisas em vez de prometer só a
  // primeira. O wizard do WEB é deliberadamente mais estrito, porque aí trata-se
  // sempre de uma inscrição nova: pede os 9–10 dígitos e mais nada.
  nif: z
    .string()
    .trim()
    .min(1, "NIF da escola obrigatório — necessário para facturação e SAF-T (AGT).")
    .refine((value) => validateSchoolNif(value).ok, {
      message:
        "NIF inválido. Use o NIF de entidade da AGT (9–10 dígitos) — confirme o número na AGT.",
    }),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  phone: optionalAngolaPhone,
  email: normalizedEmail("E-mail da escola inválido").optional().or(z.literal("")),
  logo_url: z.string().trim().optional(),

  contact_name: z.string().trim().min(2, "Nome do responsável obrigatório"),
  contact_role: z.string().trim().optional(),
  contact_phone: optionalAngolaPhone,
  contact_email: normalizedEmail("E-mail do responsável inválido"),

  plan_code: planCodeSchema,
  trial_days: z.number().int().min(0).max(90).default(14),

  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Subdomínio deve ter pelo menos 3 caracteres")
    .max(50, "Subdomínio não pode ter mais de 50 caracteres")
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Subdomínio só pode ter letras minúsculas, números e hífen",
    )
    .refine((slug) => !isReservedSubdomain(slug), {
      message: "Este subdomínio está reservado pela plataforma.",
    }),

  admin_email: normalizedEmail("E-mail do administrador inválido"),
  admin_name: z.string().trim().min(2, "Nome do administrador obrigatório"),
  // Opcional aqui: o wizard interno (platform_admin) pode continuar a criar a
  // conta sem senha e entregar o link de acesso por fora. No signup público
  // é obrigatório — ver publicSchoolSignupInputSchema — porque o e-mail de
  // convite depende de RESEND_API_KEY estar configurada, e sem senha própria
  // a escola fica sem forma nenhuma de entrar se esse envio falhar.
  admin_password: adminPasswordSchema.optional(),
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

export const updateTenantSubscriptionInputSchema = z
  .object({
    tenantId: z.string().uuid(),
    plan_code: planCodeSchema.optional(),
    extend_trial_days: z.number().int().min(1).max(90).optional(),
  })
  .refine((data) => data.plan_code != null || data.extend_trial_days != null, {
    message: "Indique plano ou extensão de trial.",
  });

export type UpdateTenantSubscriptionInput = z.infer<typeof updateTenantSubscriptionInputSchema>;

export const grantPlatformAdminInputSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
});

export type GrantPlatformAdminInput = z.infer<typeof grantPlatformAdminInputSchema>;

export const revokePlatformAdminInputSchema = z.object({
  userId: z.string().uuid(),
});

export type RevokePlatformAdminInput = z.infer<typeof revokePlatformAdminInputSchema>;

export const registerTenantDomainInputSchema = z.object({
  tenantId: z.string().uuid(),
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .min(4, "Hostname inválido")
    .max(253)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      "Use um domínio válido (ex.: portal.colegio.ao)",
    ),
});

export type RegisterTenantDomainInput = z.infer<typeof registerTenantDomainInputSchema>;

export const verifyTenantDomainInputSchema = z.object({
  domainId: z.string().uuid(),
});

export type VerifyTenantDomainInput = z.infer<typeof verifyTenantDomainInputSchema>;

export const updateTenantDomainStatusInputSchema = z.object({
  domainId: z.string().uuid(),
  status: z.enum(["pending", "active", "failed"]),
});

export type UpdateTenantDomainStatusInput = z.infer<typeof updateTenantDomainStatusInputSchema>;

export const tenantSlugInputSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1),
});

export type TenantSlugInput = z.infer<typeof tenantSlugInputSchema>;

export const tenantHostnameInputSchema = z.object({
  hostname: z.string().trim().toLowerCase().min(3).max(253),
});

export type TenantHostnameInput = z.infer<typeof tenantHostnameInputSchema>;

/**
 * Signup público (landing, sem sessão) — mesmos campos do wizard interno,
 * menos `trial_days` (fixo no servidor, nunca decidido pelo cliente, para
 * não dar a quem preenche o formulário controlo sobre a duração do trial).
 * `website` é um honeypot: campo escondido no formulário que só um bot
 * preenche; se vier com valor, o pedido é rejeitado na validação.
 */
export const publicSchoolSignupInputSchema = createSchoolWizardInputSchema
  .omit({ trial_days: true, admin_password: true })
  .extend({
    website: z.string().max(0, "Pedido inválido.").optional().or(z.literal("")),
    admin_password: adminPasswordSchema,
  });

export type PublicSchoolSignupInput = z.infer<typeof publicSchoolSignupInputSchema>;
