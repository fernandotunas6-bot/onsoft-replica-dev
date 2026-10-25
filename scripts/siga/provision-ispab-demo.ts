import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  ISPAB_DEMO,
  ISPAB_DEMO_REASON,
  ispabDemoInput,
  sealDemoCredentials,
} from "./ispab-demo-config";

let phase = "validar configuração";

async function main() {
  const password = randomBytes(32).toString("base64url") + "a7";
  const input = ispabDemoInput(password);
  if (process.argv.includes("--check-input")) {
    console.log("Fixture ISPAB válida: identidade de demonstração e e-mail não entregável.");
    return;
  }
  if (process.argv.includes("--check-runtime")) {
    await import("../../src/features/saas/provisioning-core");
    await import("../../src/features/saas/tenant-billing");
    console.log("Runtime de provisionamento carregado sem acesso à base.");
    return;
  }
  if (
    new URL(process.env["SUPABASE_URL"] ?? "https://invalid.example").origin !==
    "https://xodgfmxiaunpamctfeea.supabase.co"
  )
    throw new Error("Projecto SIGA de destino não confirmado.");
  if (process.env["RESEND_API_KEY"] || process.env["SIGA_ALERT_WEBHOOK_URL"])
    throw new Error("Este provisionamento de demonstração não envia e-mails nem alertas externos.");
  const publicPem = Buffer.from(
    process.env["ISPAB_CREDENTIAL_PUBLIC_KEY"] ?? "",
    "base64",
  ).toString("utf8");
  // Validate the key before any remote write. The private key never enters CI.
  sealDemoCredentials({ check: "key" }, publicPem);

  const { loadSgaAdminClient } = await import("../../src/integrations/supabase/sga-admin");
  const { provisionTenantCore } = await import("../../src/features/saas/provisioning-core");
  const { pauseTenantBilling } = await import("../../src/features/saas/tenant-billing");
  const { findAuthUserByEmail } = await import("../../src/features/saas/admin-account");
  const { getPlatformSubdomain } = await import("../../src/lib/saas/platform-domain");
  const db = await loadSgaAdminClient();
  phase = "verificar duplicações e plano";
  const hostname = getPlatformSubdomain(input.slug);
  const checks = await Promise.all([
    db.from("tenants").select("id").eq("slug", input.slug).maybeSingle(),
    db.from("schools").select("id").eq("nif", input.nif).maybeSingle(),
    db.from("tenant_domains").select("id").eq("hostname", hostname).maybeSingle(),
  ]);
  if (checks.some((check) => check.error))
    throw new Error("Falha ao verificar duplicações; nada foi criado.");
  if (checks.some((check) => check.data))
    throw new Error(
      "O ISPAB já tem um registo ou endereço. Operação interrompida sem alterar dados existentes.",
    );
  if (await findAuthUserByEmail(db, input.admin_email))
    throw new Error(
      "A conta demonstrativa já existe. Nenhuma senha ou vínculo existente foi alterado.",
    );
  const { data: plan, error: planError } = await db
    .from("plans")
    .select("id")
    .eq("code", input.plan_code)
    .eq("is_active", true)
    .maybeSingle();
  if (planError || !plan) throw new Error("Plano inicial indisponível; nada foi criado.");
  if (!process.argv.includes("--create")) {
    console.log("Pré-verificação concluída. Nenhum dado foi criado.");
    return;
  }

  const credentials = sealDemoCredentials(
    {
      email: input.admin_email,
      password,
      portal: `https://${hostname}/portal?escola=${input.slug}`,
    },
    publicPem,
  );
  mkdirSync(".ispab-demo-result", { recursive: true, mode: 0o700 });
  writeFileSync(".ispab-demo-result/access.enc", credentials, { mode: 0o600 });
  phase = "criar escola pelo provisionamento SIGA";
  const result = await provisionTenantCore(input, { auditUserId: null, source: "platform_admin" });
  const { data: school, error: schoolError } = await db
    .from("schools")
    .select("id, nif")
    .eq("tenant_id", result.tenantId)
    .single();
  const admin = await findAuthUserByEmail(db, input.admin_email);
  if (schoolError || school.nif !== ISPAB_DEMO.nif || !admin)
    throw new Error("Não foi possível confirmar o cadastro demonstrativo.");

  phase = "desactivar cobrança da demonstração";
  await pauseTenantBilling(
    db,
    result.tenantId,
    { reason: ISPAB_DEMO_REASON, until: null },
    admin.id,
  );
  phase = "identificar dados fictícios";
  const { error: markerError } = await db.from("school_settings").insert({
    school_id: school.id,
    domain: "demo",
    version: 1,
    value: {
      isDemo: true,
      country: "Angola",
      note: ISPAB_DEMO_REASON,
      fictionalFields: ["nif", "address", "province", "municipality", "email", "contact_name"],
    },
    changed_by: admin.id,
  });
  if (markerError) throw new Error("Não foi possível marcar os dados fictícios no cadastro.");
  phase = "auditar cadastro";
  const { error: auditError } = await db.from("saas_audit_logs").insert({
    tenant_id: result.tenantId,
    user_id: null,
    action: "ISPAB_DEMO_CREATED",
    entity: "tenant",
    entity_id: result.tenantId,
    metadata: {
      source: "github_production_workflow",
      actor: process.env["GITHUB_ACTOR"] ?? null,
      run_id: process.env["GITHUB_RUN_ID"] ?? null,
      fictional: true,
      billing_paused: true,
    },
  });
  if (auditError) throw new Error("Não foi possível registar a auditoria da demonstração.");

  writeFileSync(
    ".ispab-demo-result/status.json",
    JSON.stringify(
      {
        created: true,
        fictional: true,
        billingPaused: true,
        hostname,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      created: true,
      fictional: true,
      billingPaused: true,
      hostname,
      credentials: "RSA-OAEP encrypted artifact",
    }),
  );
}

main().catch(() => {
  // Credentials and service error objects must never be written to CI logs.
  console.error(
    `O provisionamento ISPAB parou na fase «${phase}». Verifique o estado do cadastro antes de repetir; credenciais existentes nunca são redefinidas.`,
  );
  process.exitCode = 1;
});
