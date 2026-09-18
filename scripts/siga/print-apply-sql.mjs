#!/usr/bin/env node
/**
 * Checklist operacional SQL SGA — ordem canónica + tabelas a confirmar.
 * Uso: npm run siga:sql
 * Verify (opcional, com SUPABASE_SECRET_KEY): npm run siga:sql:verify
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Load env
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const catalog = JSON.parse(readFileSync(resolve(root, "scripts/siga/modules.json"), "utf8"));

/** Tabelas / objectos mínimos por script (smoke pós-aplicar). */
export const SQL_CHECKLIST = {
  "supabase/APPLY_IN_SQL_EDITOR.sql": {
    title: "Base + gateway + preferências",
    tables: ["notification_preferences", "finance_gateway_webhook_events"],
    notes: [
      "Buckets/políticas de Storage (school-logos, siga-files, avatars) alinhados ao código",
      "Colunas de presença / identidade se referidas no script",
    ],
  },
  "supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql": {
    title: "Matrícula pública + módulos premium",
    tables: [
      "enrollment_forms",
      "enrollment_applications",
      "staff_module_grants",
      "school_integrations",
      "finance_payment_plans",
      "siga_assessment_items",
      "siga_assessment_scores",
      "siga_direct_messages",
      "siga_files",
      "siga_file_events",
      "siga_lesson_plans",
      "siga_lesson_plan_components",
      "announcements",
      "import_jobs",
      "siga_attendance_sessions",
      "siga_access_cards",
      "siga_turnstile_devices",
      "siga_access_logs",
      "school_memberships",
      "roles",
      "permissions",
      "school_invitations",
    ],
    notes: [
      "Função current_school_id() a partir de school_memberships — obrigatória",
      "Sem isto: arquivos, mensagens, planos de aula, catracas, importar falham ou degradam",
    ],
  },
  "supabase/APPLY_SAAS_PLATFORM.sql": {
    title: "Plataforma SaaS (WEB/ADMIN)",
    tables: [
      "plans",
      "tenants",
      "tenant_domains",
      "subscriptions",
      "tenant_usage",
      "saas_audit_logs",
      "platform_admins",
    ],
    notes: [
      "RLS destas tabelas: só is_platform_admin()",
      "Sem isto: wizard WEB /start e ADMIN /tenants não provisionam",
    ],
  },
  "supabase/APPLY_DIGITAL_IDENTITY.sql": {
    title: "Identidade Digital & Subdomínios Multi-Tenant",
    tables: [
      "reserved_subdomains",
      "school_branding",
      "school_email_routes",
      "mailboxes",
      "email_aliases",
      "school_slug_history",
      "slug_reservations",
      "subscription_addons",
      "tenant_provisioning",
    ],
    notes: [
      "Identidade Digital multi-tenant, branding por escola, e-mails institucionais e add-ons",
      "Wildcard *.PLATFORM_DOMAIN resolve para a aplicação sem DNS manual",
    ],
  },
};

function printChecklist() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SIGA Plus — Checklist SQL SGA (operacional)");
  console.log(`  Projecto: ${catalog.sgaRef}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("ONDE: Supabase Dashboard → projecto SGA → SQL Editor\n");
  console.log("ORDEM (não inverter):\n");

  for (const [index, file] of catalog.sqlApply.entries()) {
    const abs = resolve(root, file);
    const ok = existsSync(abs) ? "✓" : "✗ FICHEIRO EM FALTA";
    const meta = SQL_CHECKLIST[file];
    console.log(`  ${index + 1}. ${file}  ${ok}`);
    if (meta) {
      console.log(`     → ${meta.title}`);
      for (const note of meta.notes) console.log(`       • ${note}`);
      console.log(`     Smoke tables (${meta.tables.length}):`);
      console.log(`       ${meta.tables.join(", ")}`);
    }
    console.log("");
  }

  console.log("DEPOIS DE APLICAR — confirmar no Table Editor (ou siga:sql:verify):\n");
  console.log("  [ ] current_school_id() existe (SQL: select current_school_id();)");
  console.log("  [ ] Arquivos / Planos de aula / Mensagens sem banner «aplique SQL»");
  console.log("  [ ] WEB /start cria tenant; ADMIN /tenants lista");
  console.log("  [ ] Storage: school-logos público restrito; siga-files e avatars privados\n");

  console.log("NUNCA aplicar ao SGA:");
  for (const file of catalog.sqlNeverApplyToSga) console.log(`  ✗ ${file}`);
  console.log("  ✗ migrações Lovable 2026081114* isoladas");
  console.log("  ✗ all_migrations_combined.sql / pending_feature_migrations.sql\n");

  console.log("DOC: painel/docs/guide/sql-sga.md");
  console.log("Comando verify: npm run siga:sql:verify\n");
  console.log("Se o verify reportar lacunas (ex. catracas / gateway / presença):");
  console.log("  → supabase/APPLY_MISSING_FROM_VERIFY.sql  (colar no SQL Editor)\n");
}

async function verifyAgainstSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("siga:sql:verify precisa de SUPABASE_URL + SUPABASE_SECRET_KEY no ambiente.");
    process.exit(1);
  }

  const allTables = Object.values(SQL_CHECKLIST).flatMap((m) => m.tables);
  const unique = [...new Set(allTables)];
  console.log(`A verificar ${unique.length} tabelas em ${url}…\n`);

  const missing = [];
  const present = [];
  for (const table of unique) {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=0`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });
    if (res.status === 404 || res.status === 406) {
      // 406 can happen with Prefer; retry without Prefer
      const res2 = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res2.ok) {
        missing.push(`${table} (HTTP ${res2.status})`);
      } else {
        present.push(table);
      }
    } else if (!res.ok) {
      missing.push(`${table} (HTTP ${res.status})`);
    } else {
      present.push(table);
    }
  }

  console.log(`Presentes: ${present.length}/${unique.length}`);
  if (missing.length) {
    console.log("\nEm falta ou inacessíveis:");
    for (const m of missing) console.log(`  ✗ ${m}`);
    console.log("\nAcção recomendada:");
    console.log("  1. Abrir supabase/APPLY_MISSING_FROM_VERIFY.sql");
    console.log("  2. Colar no SQL Editor do projecto SGA e executar");
    console.log("  3. Voltar a correr: npm run siga:sql:verify");
    console.log("\n(Em ambiente novo: ordem canónica 1→2→3, não só o patch.)");
    process.exit(1);
  }
  console.log(
    "\n✓ Smoke de tabelas OK. Confirme ainda current_school_id() e Storage no Dashboard.",
  );
}

const mode = process.argv.includes("--verify") ? "verify" : "print";
if (mode === "verify") {
  verifyAgainstSupabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  printChecklist();
}
