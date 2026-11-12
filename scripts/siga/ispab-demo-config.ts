import { createPublicKey, constants, publicEncrypt } from "node:crypto";
import { createSchoolWizardInputSchema } from "../../src/features/saas/schemas";

export const ISPAB_DEMO = {
  name: "ISPAB (Demonstração)",
  commercial_name: "ISPAB (Demonstração)",
  nif: "DEMOISPAB2026",
  address: "Morada de demonstração — substituir pelos dados oficiais",
  province: "Benguela",
  municipality: "Benguela",
  city: "Benguela",
  school_type: "outra",
  teaching_levels: ["superior"],
  email: "ispab-admin@example.invalid",
  contact_name: "Administrador de demonstração ISPAB",
  contact_role: "Administrador",
  contact_email: "ispab-admin@example.invalid",
  admin_name: "Administrador de demonstração ISPAB",
  admin_email: "ispab-admin@example.invalid",
  slug: "ispab",
  plan_code: "start",
  trial_days: 14,
} as const;

export const ISPAB_DEMO_REASON = "Demonstração ISPAB — dados fictícios, sem cobrança";

export function ispabDemoInput(password: string) {
  return createSchoolWizardInputSchema.parse({ ...ISPAB_DEMO, admin_password: password });
}

export function sealDemoCredentials(data: Record<string, string>, publicPem: string) {
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 4096)
    throw new Error("Use uma chave pública RSA de pelo menos 4096 bits.");
  return publicEncrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(JSON.stringify(data), "utf8"),
  );
}
